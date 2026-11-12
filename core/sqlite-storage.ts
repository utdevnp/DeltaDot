import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import type { AppConfig, CacheFile, DeploymentMappingTab, KubeContextSettings, PR, RepoState, Workspace } from './types.js';

const SCHEMA_VERSION = 2;
const DEFAULT_DB_PATH = join(homedir(), '.deltadot', 'deltadot.sqlite');
const DEFAULT_LEGACY_ROOT = join(homedir(), '.deltadot');

type JsonRecord = Record<string, unknown>;

function json<T>(value: T): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  return JSON.parse(value) as T;
}

function isObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function includesFields(actual: unknown, expected: unknown): boolean {
  if (!isObject(actual) || !isObject(expected)) return isDeepStrictEqual(actual, expected);
  return Object.entries(expected).every(([key, value]) => isDeepStrictEqual(actual[key], value));
}

export class DeltaDotDatabase {
  private readonly db: DatabaseSync;
  private readonly legacyRoot: string;

  constructor(databasePath = DEFAULT_DB_PATH, legacyRoot = DEFAULT_LEGACY_ROOT) {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(databasePath, { timeout: 5000 });
    this.legacyRoot = legacyRoot;
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.createSchema();
    try { chmodSync(databasePath, 0o600); } catch { /* Platform or filesystem may not support chmod. */ }
    this.migrateLegacyFiles();
  }

  private createSchema(): void {
    const current = Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (current > SCHEMA_VERSION) throw new Error(`Database schema ${current} is newer than this app supports (${SCHEMA_VERSION}).`);
    if (current === 1) this.migrateV1ToV2();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        display_name TEXT,
        path TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        registered INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS cache_metadata (
        workspace TEXT PRIMARY KEY,
        base TEXT NOT NULL,
        release TEXT NOT NULL,
        last_full_sync TEXT NOT NULL,
        has_prs INTEGER NOT NULL DEFAULT 0,
        has_ai_reviews INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS comparison_cache (
        workspace TEXT NOT NULL,
        base TEXT NOT NULL,
        release TEXT NOT NULL,
        cache_json TEXT NOT NULL,
        PRIMARY KEY(workspace, base, release)
      );
      CREATE TABLE IF NOT EXISTS repo_cache (
        workspace TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        position INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        PRIMARY KEY (workspace, repo_path)
      );
      CREATE TABLE IF NOT EXISTS prs (
        workspace TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        position INTEGER NOT NULL,
        pr_json TEXT NOT NULL,
        PRIMARY KEY (workspace, position)
      );
      CREATE INDEX IF NOT EXISTS prs_by_repository ON prs(workspace, repo_name, pr_number);
      CREATE TABLE IF NOT EXISTS ai_reviews (
        workspace TEXT NOT NULL,
        review_key TEXT NOT NULL,
        review_text TEXT NOT NULL,
        PRIMARY KEY (workspace, review_key)
      );
      CREATE TABLE IF NOT EXISTS mapping_tabs (
        workspace_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        name TEXT NOT NULL,
        context TEXT NOT NULL,
        last_release_context TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (workspace_id, tab_id)
      );
      CREATE TABLE IF NOT EXISTS mapping_domains (
        workspace_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        domain_id TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (workspace_id, tab_id, domain_id)
      );
      CREATE TABLE IF NOT EXISTS deployment_mappings (
        workspace_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        mapping_id TEXT NOT NULL,
        context TEXT NOT NULL,
        namespace TEXT NOT NULL,
        deployment TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        mapping_json TEXT NOT NULL,
        PRIMARY KEY (workspace_id, tab_id, mapping_id)
      );
      CREATE TABLE IF NOT EXISTS mapping_domain_memberships (
        workspace_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        mapping_id TEXT NOT NULL,
        domain_id TEXT NOT NULL,
        PRIMARY KEY (workspace_id, tab_id, mapping_id, domain_id)
      );
      CREATE TABLE IF NOT EXISTS deployment_snapshots (
        workspace_id TEXT NOT NULL,
        tab_id TEXT NOT NULL,
        snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('current', 'last_release')),
        snapshot_json TEXT NOT NULL,
        PRIMARY KEY (workspace_id, tab_id, snapshot_kind)
      );
      CREATE TABLE IF NOT EXISTS current_reports (
        workspace_id TEXT PRIMARY KEY,
        generated_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      );
    `);
    if (current === 0) this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  private migrateV1ToV2(): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        ALTER TABLE prs RENAME TO prs_v1;
        CREATE TABLE prs (
          workspace TEXT NOT NULL,
          repo_name TEXT NOT NULL,
          pr_number INTEGER NOT NULL,
          position INTEGER NOT NULL,
          pr_json TEXT NOT NULL,
          PRIMARY KEY (workspace, position)
        );
        INSERT INTO prs(workspace, repo_name, pr_number, position, pr_json)
          SELECT workspace, repo_name, pr_number, position, pr_json FROM prs_v1;
        DROP TABLE prs_v1;
        CREATE INDEX prs_by_repository ON prs(workspace, repo_name, pr_number);
        PRAGMA user_version = 2;
      `);
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private transaction<T>(action: () => T): T {
    const nested = this.db.isTransaction;
    if (!nested) this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      if (!nested) this.db.exec('COMMIT');
      return result;
    } catch (error) {
      if (!nested && this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private rawSetting(key: string): string | undefined {
    return (this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as { value_json: string } | undefined)?.value_json;
  }

  getSetting<T>(key: string, fallback?: T): T | undefined {
    const raw = this.rawSetting(key);
    return raw === undefined ? fallback : parseJson<T>(raw, fallback as T);
  }

  setSetting<T>(key: string, value: T): void {
    this.db.prepare('INSERT INTO app_settings(key, value_json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key, json(value));
  }

  loadGlobalConfig(): Partial<AppConfig> {
    return this.getSetting<Partial<AppConfig>>('globalConfig', {}) ?? {};
  }

  saveGlobalConfig(config: AppConfig): void {
    this.transaction(() => {
      this.setSetting('globalConfig', config);
      if (config.workspace) this.replaceMappingTables(config.workspace, config);
    });
  }

  loadWorkspaces(): Workspace[] {
    const rows = this.db.prepare('SELECT id, name, display_name, path, color, is_default, config_json FROM workspaces WHERE registered=1 ORDER BY position, rowid').all() as Array<{
      id: string; name: string; display_name: string | null; path: string; color: string; is_default: number; config_json: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.display_name ? { displayName: row.display_name } : {}),
      path: row.path,
      color: row.color,
      ...(row.is_default ? { isDefault: true } : {}),
      config: parseJson<AppConfig>(row.config_json, {} as AppConfig),
    }));
  }

  saveWorkspaces(workspaces: Workspace[]): void {
    this.transaction(() => {
      const registeredIds = (this.db.prepare('SELECT id FROM workspaces WHERE registered=1').all() as Array<{ id: string }>).map((row) => row.id);
      workspaces.forEach((workspace, position) => this.putWorkspace(workspace, position, true));
      const retainedIds = new Set(workspaces.map((workspace) => workspace.id));
      for (const id of registeredIds) {
        if (!retainedIds.has(id)) this.db.prepare('UPDATE workspaces SET registered=0 WHERE id=?').run(id);
      }
    });
  }

  removeWorkspace(id: string): Workspace[] {
    this.transaction(() => {
      this.db.prepare('UPDATE workspaces SET registered=0 WHERE id=?').run(id);
      const remaining = this.loadWorkspaces();
      if (remaining.length === 0) {
        this.setSetting('activeWorkspaceId', null);
        const globalConfig = this.loadGlobalConfig();
        this.setSetting('globalConfig', { ...globalConfig, workspace: '' });
      } else if (this.loadActiveWorkspaceId() === id) {
        this.setSetting('activeWorkspaceId', remaining[0]!.id);
      }
    });
    return this.loadWorkspaces();
  }

  private putWorkspace(workspace: Workspace, position: number, registered: boolean): void {
    const previous = this.db.prepare('SELECT registered, config_json FROM workspaces WHERE id=?').get(workspace.id) as { registered: number; config_json: string } | undefined;
    // Removing a workspace only removes it from the picker in the old app;
    // its per-workspace config remains available if the same path is added again.
    const config = previous && !previous.registered && registered
      ? parseJson<AppConfig>(previous.config_json, workspace.config)
      : workspace.config;
    this.db.prepare(`
      INSERT INTO workspaces(id, name, display_name, path, color, is_default, registered, position, config_json)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, display_name=excluded.display_name, path=excluded.path,
        color=excluded.color, is_default=excluded.is_default, registered=excluded.registered,
        position=excluded.position, config_json=excluded.config_json
    `).run(workspace.id, workspace.name, workspace.displayName ?? null, workspace.path, workspace.color,
      workspace.isDefault ? 1 : 0, registered ? 1 : 0, position, json(config ?? {}));
    this.replaceMappingTables(workspace.id, config);
  }

  loadWorkspaceConfig(id: string): Partial<AppConfig> {
    const raw = (this.db.prepare('SELECT config_json FROM workspaces WHERE id=?').get(id) as { config_json: string } | undefined)?.config_json;
    return parseJson<Partial<AppConfig>>(raw, {});
  }

  saveWorkspaceConfig(id: string, config: AppConfig): void {
    this.transaction(() => {
      const existing = this.db.prepare('SELECT 1 AS found FROM workspaces WHERE id=?').get(id);
      if (existing) {
        this.db.prepare('UPDATE workspaces SET config_json=? WHERE id=?').run(json(config), id);
      } else {
        this.db.prepare(`INSERT INTO workspaces(id, path, registered, config_json) VALUES(?, ?, 0, ?)`)
          .run(id, config.workspace ?? '', json(config));
      }
      this.replaceMappingTables(id, config);
    });
  }

  loadActiveWorkspaceId(): string | null {
    return this.getSetting<string | null>('activeWorkspaceId', null) ?? null;
  }

  saveActiveWorkspaceId(id: string): void {
    this.setSetting('activeWorkspaceId', id);
  }

  loadKubeContext(): string | null {
    return this.getSetting<string | null>('kubeContext', null) ?? null;
  }

  saveKubeContext(contextName: string): void {
    this.setSetting('kubeContext', contextName);
  }

  loadKubeContextSettings(): KubeContextSettings {
    return this.getSetting<KubeContextSettings>('kubeContextSettings', {}) ?? {};
  }

  saveKubeContextSettings(settings: KubeContextSettings): void {
    this.setSetting('kubeContextSettings', settings);
  }

  loadCache(workspace: string, base?: string, release?: string): CacheFile | null {
    if (base !== undefined && release !== undefined) {
      const row = this.db.prepare('SELECT cache_json FROM comparison_cache WHERE workspace=? AND base=? AND release=?').get(workspace, base, release) as { cache_json: string } | undefined;
      if (row) return JSON.parse(row.cache_json) as CacheFile;
    }
    const metadata = this.db.prepare('SELECT base, release, last_full_sync, has_prs, has_ai_reviews FROM cache_metadata WHERE workspace=?').get(workspace) as {
      base: string; release: string; last_full_sync: string; has_prs: number; has_ai_reviews: number;
    } | undefined;
    if (!metadata || (base !== undefined && release !== undefined && (metadata.base !== base || metadata.release !== release))) return null;
    const repos = (this.db.prepare('SELECT state_json FROM repo_cache WHERE workspace=? ORDER BY position').all(workspace) as Array<{ state_json: string }>).map((row) => JSON.parse(row.state_json) as RepoState);
    const cache: CacheFile = { workspace, base: metadata.base, release: metadata.release, lastFullSync: metadata.last_full_sync, repos };
    if (metadata.has_prs) cache.prs = (this.db.prepare('SELECT pr_json FROM prs WHERE workspace=? ORDER BY position').all(workspace) as Array<{ pr_json: string }>).map((row) => JSON.parse(row.pr_json) as PR);
    if (metadata.has_ai_reviews) {
      cache.aiReviews = Object.fromEntries((this.db.prepare('SELECT review_key, review_text FROM ai_reviews WHERE workspace=?').all(workspace) as Array<{ review_key: string; review_text: string }>).map((row) => [row.review_key, row.review_text]));
    }
    return cache;
  }

  saveCache(cache: CacheFile): void {
    this.transaction(() => {
      const previous = this.loadCache(cache.workspace);
      const insert = this.db.prepare('INSERT INTO comparison_cache(workspace, base, release, cache_json) VALUES(?, ?, ?, ?) ON CONFLICT(workspace, base, release) DO UPDATE SET cache_json=excluded.cache_json WHERE comparison_cache.cache_json != excluded.cache_json');
      if (previous && (previous.base !== cache.base || previous.release !== cache.release)) {
        insert.run(previous.workspace, previous.base, previous.release, json(previous));
      }
      this.writeCache(cache);
      insert.run(cache.workspace, cache.base, cache.release, json(cache));
    });
  }

  private writeCache(cache: CacheFile): void {
    this.db.prepare(`INSERT INTO cache_metadata(workspace, base, release, last_full_sync, has_prs, has_ai_reviews)
      VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(workspace) DO UPDATE SET base=excluded.base, release=excluded.release,
      last_full_sync=excluded.last_full_sync, has_prs=excluded.has_prs, has_ai_reviews=excluded.has_ai_reviews
      WHERE cache_metadata.base != excluded.base OR cache_metadata.release != excluded.release
        OR cache_metadata.last_full_sync != excluded.last_full_sync OR cache_metadata.has_prs != excluded.has_prs
        OR cache_metadata.has_ai_reviews != excluded.has_ai_reviews`)
      .run(cache.workspace, cache.base, cache.release, cache.lastFullSync, cache.prs === undefined ? 0 : 1, cache.aiReviews === undefined ? 0 : 1);
    const existingRepos = this.db.prepare('SELECT repo_path FROM repo_cache WHERE workspace=?').all(cache.workspace) as Array<{ repo_path: string }>;
    const wantedRepoPaths = new Set(cache.repos.map((repo) => repo.path));
    const deleteRepo = this.db.prepare('DELETE FROM repo_cache WHERE workspace=? AND repo_path=?');
    for (const row of existingRepos) if (!wantedRepoPaths.has(row.repo_path)) deleteRepo.run(cache.workspace, row.repo_path);
    const putRepo = this.db.prepare(`INSERT INTO repo_cache(workspace, repo_path, position, state_json) VALUES(?, ?, ?, ?)
      ON CONFLICT(workspace, repo_path) DO UPDATE SET position=excluded.position, state_json=excluded.state_json
      WHERE repo_cache.position != excluded.position OR repo_cache.state_json != excluded.state_json`);
    cache.repos.forEach((repo, position) => putRepo.run(cache.workspace, repo.path, position, json(repo)));

    const existingPrs = this.db.prepare('SELECT position FROM prs WHERE workspace=?').all(cache.workspace) as Array<{ position: number }>;
    const prs = cache.prs ?? [];
    const wantedPrPositions = new Set(prs.map((_pr, position) => position));
    const deletePr = this.db.prepare('DELETE FROM prs WHERE workspace=? AND position=?');
    for (const row of existingPrs) if (!wantedPrPositions.has(row.position)) deletePr.run(cache.workspace, row.position);
    const putPr = this.db.prepare(`INSERT INTO prs(workspace, repo_name, pr_number, position, pr_json) VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(workspace, position) DO UPDATE SET repo_name=excluded.repo_name, pr_number=excluded.pr_number, pr_json=excluded.pr_json
      WHERE prs.repo_name != excluded.repo_name OR prs.pr_number != excluded.pr_number OR prs.pr_json != excluded.pr_json`);
    prs.forEach((pr, position) => putPr.run(cache.workspace, pr.repoName, pr.number, position, json(pr)));

    const existingReviews = this.db.prepare('SELECT review_key FROM ai_reviews WHERE workspace=?').all(cache.workspace) as Array<{ review_key: string }>;
    const reviewEntries = Object.entries(cache.aiReviews ?? {});
    const wantedReviewKeys = new Set(reviewEntries.map(([key]) => key));
    const deleteReview = this.db.prepare('DELETE FROM ai_reviews WHERE workspace=? AND review_key=?');
    for (const row of existingReviews) if (!wantedReviewKeys.has(row.review_key)) deleteReview.run(cache.workspace, row.review_key);
    const putReview = this.db.prepare(`INSERT INTO ai_reviews(workspace, review_key, review_text) VALUES(?, ?, ?)
      ON CONFLICT(workspace, review_key) DO UPDATE SET review_text=excluded.review_text
      WHERE ai_reviews.review_text != excluded.review_text`);
    reviewEntries.forEach(([key, value]) => putReview.run(cache.workspace, key, value));
  }

  loadCurrentReport<T>(workspaceId: string): T | null {
    const row = this.db.prepare('SELECT snapshot_json FROM current_reports WHERE workspace_id=?').get(workspaceId) as { snapshot_json: string } | undefined;
    return row ? JSON.parse(row.snapshot_json) as T : null;
  }

  saveCurrentReport(workspaceId: string, report: unknown | null): void {
    if (report === null) {
      this.db.prepare('DELETE FROM current_reports WHERE workspace_id=?').run(workspaceId);
      return;
    }
    this.db.prepare(`INSERT INTO current_reports(workspace_id, generated_at, snapshot_json) VALUES(?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET generated_at=excluded.generated_at, snapshot_json=excluded.snapshot_json`)
      .run(workspaceId, new Date().toISOString(), json(report));
  }

  loadMappingColumnPrefs(legacy?: Record<string, string[]>): Record<string, string[]> {
    const current = this.getSetting<Record<string, string[]> | null>('mappingColumnPrefs', undefined);
    if (current !== undefined && current !== null) return current;
    const imported = legacy ?? {};
    this.setSetting('mappingColumnPrefs', imported);
    return imported;
  }

  saveMappingColumnPrefs(preferences: Record<string, string[]>): void {
    this.setSetting('mappingColumnPrefs', preferences);
  }

  private replaceMappingTables(workspaceId: string, config: Partial<AppConfig> | undefined): void {
    this.db.prepare('DELETE FROM mapping_tabs WHERE workspace_id=?').run(workspaceId);
    // The other mapping tables have no cascading foreign keys, so clear them explicitly.
    this.db.prepare('DELETE FROM mapping_domains WHERE workspace_id=?').run(workspaceId);
    this.db.prepare('DELETE FROM deployment_mappings WHERE workspace_id=?').run(workspaceId);
    this.db.prepare('DELETE FROM mapping_domain_memberships WHERE workspace_id=?').run(workspaceId);
    this.db.prepare('DELETE FROM deployment_snapshots WHERE workspace_id=?').run(workspaceId);
    let tabs = config?.deploymentMappingTabs ?? [];
    if (!tabs.length && config?.deploymentMappings?.length) {
      tabs = [{ id: 'mapping-default', name: 'Mapping 1', context: config.mappingContext ?? '', mappings: config.deploymentMappings }];
    }
    const activeId = config?.activeDeploymentMappingTab;
    const putTab = this.db.prepare('INSERT INTO mapping_tabs(workspace_id, tab_id, name, context, last_release_context, is_active) VALUES(?, ?, ?, ?, ?, ?)');
    const putDomain = this.db.prepare('INSERT INTO mapping_domains(workspace_id, tab_id, domain_id, name) VALUES(?, ?, ?, ?)');
    const putMapping = this.db.prepare(`INSERT INTO deployment_mappings(workspace_id, tab_id, mapping_id, context, namespace, deployment, repo_path, mapping_json)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)`);
    const putMembership = this.db.prepare('INSERT OR IGNORE INTO mapping_domain_memberships(workspace_id, tab_id, mapping_id, domain_id) VALUES(?, ?, ?, ?)');
    const putSnapshot = this.db.prepare('INSERT INTO deployment_snapshots(workspace_id, tab_id, snapshot_kind, snapshot_json) VALUES(?, ?, ?, ?)');
    for (const tab of tabs) {
      putTab.run(workspaceId, tab.id, tab.name, tab.context, tab.lastReleaseContext ?? null, tab.id === activeId ? 1 : 0);
      for (const domain of tab.domains ?? []) putDomain.run(workspaceId, tab.id, domain.id, domain.name);
      for (const mapping of tab.mappings ?? []) {
        putMapping.run(workspaceId, tab.id, mapping.id, mapping.context, mapping.namespace, mapping.deployment, mapping.repoPath ?? '', json(mapping));
        for (const domainId of mapping.domainIds ?? []) putMembership.run(workspaceId, tab.id, mapping.id, domainId);
      }
      if (tab.deploymentSnapshot) putSnapshot.run(workspaceId, tab.id, 'current', json(tab.deploymentSnapshot));
      if (tab.lastReleaseDeploymentSnapshot) putSnapshot.run(workspaceId, tab.id, 'last_release', json(tab.lastReleaseDeploymentSnapshot));
    }
  }

  private migrateLegacyFiles(): void {
    const globalPath = join(this.legacyRoot, 'config.json');
    this.migrateJsonSource(globalPath, 'global-config', isObject,
      (value) => this.setSettingIfMissing('globalConfig', value),
      (value) => isDeepStrictEqual(this.getSetting('globalConfig'), value));

    const workspacesPath = join(this.legacyRoot, 'workspaces.json');
    this.migrateJsonSource(workspacesPath, 'workspaces', (value): value is Workspace[] => Array.isArray(value) && value.every((row) => isObject(row) && typeof row.id === 'string'),
      (rows) => this.saveWorkspacesIfMissing(rows),
      (rows) => rows.every((workspace) => {
        const loaded = this.loadWorkspaces().find((row) => row.id === workspace.id);
        return !!loaded && loaded.name === workspace.name && loaded.path === workspace.path
          && loaded.color === workspace.color && isDeepStrictEqual(loaded.config, workspace.config);
      }));

    const configDir = join(this.legacyRoot, 'workspaces');
    if (existsSync(configDir)) {
      const sources = new Map<string, string>();
      for (const workspace of this.loadWorkspaces()) sources.set(workspace.id, join(configDir, workspace.id, 'config.json'));
      const visit = (directory: string): void => {
        let entries;
        try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile() && entry.name === 'config.json' && ![...sources.values()].includes(path)) {
            const storedPath = relative(configDir, dirname(path));
            // Older workspace IDs are absolute folder paths; Node's join stores
            // those below this directory without the leading slash.
            const inferredId = process.platform === 'win32' ? storedPath : `/${storedPath}`;
            sources.set(inferredId, path);
          }
        }
      };
      visit(configDir);
      for (const [id, configPath] of sources) {
        this.migrateJsonSource(configPath, `workspace-config:${id}`, isObject,
          (value) => this.saveWorkspaceConfigIfMissing(id, value as Partial<AppConfig>),
          (value) => includesFields(this.loadWorkspaceConfig(id), value));
      }
    }

    const activePath = join(this.legacyRoot, 'active-workspace');
    this.migrateTextSource(activePath, 'active-workspace', (value) => this.setSettingIfMissing('activeWorkspaceId', value),
      (value) => this.getSetting('activeWorkspaceId') === value);
    const contextPath = join(this.legacyRoot, 'kube-context');
    this.migrateTextSource(contextPath, 'kube-context', (value) => this.setSettingIfMissing('kubeContext', value),
      (value) => this.getSetting('kubeContext') === value);

    const kubeSettingsPath = join(this.legacyRoot, 'kube-contexts.json');
    this.migrateJsonSource(kubeSettingsPath, 'kube-context-settings', isObject,
      (value) => this.setSettingIfMissing('kubeContextSettings', value),
      (value) => isDeepStrictEqual(this.getSetting('kubeContextSettings'), value));

    const cachePaths = new Set<string>();
    for (const workspace of this.loadWorkspaces()) if (workspace.path) cachePaths.add(workspace.path);
    const globalConfig = this.loadGlobalConfig();
    if (globalConfig.workspace) cachePaths.add(globalConfig.workspace);
    for (const workspacePath of cachePaths) {
      const cachePath = join(workspacePath, '.deltadot-cache.json');
      this.migrateJsonSource(cachePath, `workspace-cache:${resolve(workspacePath)}`,
        (value): value is CacheFile => isObject(value) && typeof value.workspace === 'string' && Array.isArray(value.repos),
        (value) => this.saveCacheIfMissing(value),
        (value) => isDeepStrictEqual(this.loadCache(value.workspace), value));
    }
  }

  private setSettingIfMissing<T>(key: string, value: T): void {
    if (this.rawSetting(key) === undefined) this.setSetting(key, value);
  }

  private saveWorkspacesIfMissing(workspaces: Workspace[]): void {
    workspaces.forEach((workspace, position) => {
      const exists = this.db.prepare('SELECT 1 AS found FROM workspaces WHERE id=?').get(workspace.id);
      if (!exists) this.putWorkspace(workspace, position, true);
    });
  }

  private saveWorkspaceConfigIfMissing(id: string, config: Partial<AppConfig>): void {
    const marker = `legacy-config:${id}`;
    if (this.rawSetting(marker) !== undefined) return;
    const existing = this.db.prepare('SELECT config_json FROM workspaces WHERE id=?').get(id) as { config_json: string } | undefined;
    const merged = { ...(existing ? parseJson<Partial<AppConfig>>(existing.config_json, {}) : {}), ...config } as AppConfig;
    this.saveWorkspaceConfig(id, merged);
  }

  private saveCacheIfMissing(cache: CacheFile): void {
    const exists = this.db.prepare('SELECT 1 AS found FROM cache_metadata WHERE workspace=?').get(cache.workspace);
    if (!exists) this.saveCache(cache);
  }

  private migrateTextSource(path: string, source: string, apply: (value: string) => void, verify: (value: string) => boolean): void {
    this.migrateSource(path, source, (raw) => raw.trim(), apply, verify);
  }

  private migrateJsonSource<T>(path: string, source: string, validate: (value: unknown) => value is T,
    apply: (value: T) => void, verify: (value: T) => boolean): void {
    this.migrateSource(path, source, (raw) => {
      const value: unknown = JSON.parse(raw);
      if (!validate(value)) throw new Error('Unexpected JSON structure');
      return value;
    }, apply, verify);
  }

  private migrateSource<T>(path: string, source: string, parse: (raw: string) => T, apply: (value: T) => void, verify: (value: T) => boolean): void {
    if (!existsSync(path)) return;
    const marker = `legacy-import:${source}`;
    try {
      if (this.rawSetting(marker) !== undefined) {
        unlinkSync(path);
        return;
      }
      const value = parse(readFileSync(path, 'utf8'));
      this.transaction(() => {
        if (this.rawSetting(marker) === undefined) apply(value);
        if (!verify(value)) throw new Error('Imported records did not match the source data');
        this.setSetting(marker, true);
      });
      unlinkSync(path);
    } catch (error) {
      console.warn(`[DeltaDot] Could not migrate ${path}; source file was retained.`, error);
    }
  }

  close(): void {
    this.db.close();
  }
}

let singleton: DeltaDotDatabase | null = null;

export function initializeDatabase(): DeltaDotDatabase {
  if (!singleton) singleton = new DeltaDotDatabase();
  return singleton;
}

export function database(): DeltaDotDatabase {
  return initializeDatabase();
}

export function closeDatabaseForTests(): void {
  singleton?.close();
  singleton = null;
}
