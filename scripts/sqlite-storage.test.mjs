import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DeltaDotDatabase } from '../dist-electron/core/sqlite-storage.js';
import { nextBranchPair, workspaceNeedsInitialSync } from '../dist-electron/core/workspace-cache.js';

const makeRoot = () => mkdtempSync(join(tmpdir(), 'deltadot-sqlite-test-'));
const writeJson = (path, value) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
};

test('creates versioned schema and round-trips settings, caches, mappings, and current reports', () => {
  const root = makeRoot();
  const store = new DeltaDotDatabase(join(root, 'deltadot.sqlite'), join(root, 'legacy'));
  try {
    const tableCount = store.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count;
    assert.equal(tableCount, 13);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);

    const workspace = {
      id: 'ws-1', name: 'Workspace', path: join(root, 'project'), color: 'blue', config: {
        workspace: join(root, 'project'), base: 'main', release: 'release', syncInterval: 10, token: '', provider: 'github',
        taskProvider: 'none', jiraUrl: '', jiraEmail: '', jiraApiToken: '', aiProvider: 'none', aiApiKey: '', aiApiUrl: '',
        aiModel: 'gpt-4o', aiSystemPrompt: '', theme: 'system', deploymentMappingTabs: [{
          id: 'tab-1', name: 'Main', context: 'dev', mappings: [{ id: 'map-1', context: 'dev', namespace: 'default', deployment: 'api', repoPath: '/repo', domainIds: ['domain-1'] }],
          domains: [{ id: 'domain-1', name: 'Platform' }], deploymentSnapshot: [{ name: 'api', namespace: 'default', image: 'api:v1' }],
        }], activeDeploymentMappingTab: 'tab-1',
      },
    };
    store.saveWorkspaces([workspace]);
    assert.deepEqual(store.loadWorkspaces(), [workspace]);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM mapping_tabs').get().count, 1);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM mapping_domains').get().count, 1);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM deployment_mappings').get().count, 1);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM mapping_domain_memberships').get().count, 1);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM deployment_snapshots').get().count, 1);

    store.saveActiveWorkspaceId('ws-1');
    assert.equal(store.loadActiveWorkspaceId(), 'ws-1');
    const firstRepo = { name: 'api', path: '/repo', status: 'synced', diffCommits: [], latestCommits: [], lastCommitMsg: '', lastCommitAge: '', lastCommitAuthor: '', latestVersion: null, latestVersionDate: null, currentBranch: 'main', error: null };
    const secondRepo = { ...firstRepo, name: 'worker', path: '/worker' };
    const pr = { number: 9, repoName: 'api', title: 'Fix', author: 'Dev', state: 'open', sourceBranch: 'fix', targetBranch: 'main', createdAt: '', url: '', approved: false };
    const cache = { workspace: workspace.path, base: 'main', release: 'release', lastFullSync: '2026-11-05T00:00:00.000Z', repos: [firstRepo, secondRepo], prs: [pr, pr], aiReviews: { 'api-9': 'Review text' } };
    store.saveCache(cache);
    assert.deepEqual(store.loadCache(workspace.path), cache);
    const beforeTargetedUpdate = store.db.prepare('SELECT total_changes() AS count').get().count;
    store.saveCache({ ...cache, repos: [{ ...firstRepo, status: 'behind' }, secondRepo] });
    const afterTargetedUpdate = store.db.prepare('SELECT total_changes() AS count').get().count;
    assert.equal(afterTargetedUpdate - beforeTargetedUpdate, 2, 'updating one repo updates its row and comparison snapshot');
    store.saveCurrentReport('ws-1', { tabId: 'tab-1', title: 'Main', rows: [] });
    assert.deepEqual(store.loadCurrentReport('ws-1'), { tabId: 'tab-1', title: 'Main', rows: [] });
    store.saveCurrentReport('ws-1', null);
    assert.equal(store.loadCurrentReport('ws-1'), null);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('migrates and removes valid legacy sources only after importing their records', () => {
  const root = makeRoot();
  const legacy = join(root, 'legacy');
  const workspacePath = join(root, 'project');
  const ws = { id: workspacePath, name: 'Project', path: workspacePath, color: 'blue', config: { workspace: workspacePath, base: 'main' } };
  const config = { workspace: workspacePath, release: 'release', theme: 'dark' };
  const cache = { workspace: workspacePath, base: 'main', release: 'release', lastFullSync: 'now', repos: [], prs: [], aiReviews: { x: 'y' } };
  const globalPath = join(legacy, 'config.json');
  const workspacesPath = join(legacy, 'workspaces.json');
  const workspaceConfigPath = join(legacy, 'workspaces', ws.id, 'config.json');
  const cachePath = join(workspacePath, '.deltadot-cache.json');
  const contextSettingsPath = join(legacy, 'kube-contexts.json');
  const activePath = join(legacy, 'active-workspace');
  const kubeContextPath = join(legacy, 'kube-context');
  writeJson(globalPath, { ...config, token: 'gh-token' });
  writeJson(workspacesPath, [ws]);
  writeJson(workspaceConfigPath, { release: 'release', base: 'develop' });
  writeJson(cachePath, cache);
  writeJson(contextSettingsPath, { dev: { environment: 'non-prod', enabled: true } });
  mkdirSync(legacy, { recursive: true });
  writeFileSync(activePath, ws.id);
  writeFileSync(kubeContextPath, 'dev');

  const store = new DeltaDotDatabase(join(root, 'deltadot.sqlite'), legacy);
  try {
    assert.equal(store.loadGlobalConfig().token, 'gh-token');
    assert.equal(store.loadWorkspaces()[0].id, ws.id);
    assert.equal(store.loadWorkspaceConfig(ws.id).base, 'develop');
    assert.deepEqual(store.loadCache(workspacePath), cache);
    assert.equal(store.loadActiveWorkspaceId(), ws.id);
    assert.equal(store.loadKubeContext(), 'dev');
    assert.equal(store.loadKubeContextSettings().dev.environment, 'non-prod');
    for (const source of [globalPath, workspacesPath, workspaceConfigPath, cachePath, contextSettingsPath, activePath, kubeContextPath]) assert.equal(existsSync(source), false, `${source} should be removed after verified import`);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('restores the saved current report after reopening the database', () => {
  const root = makeRoot();
  const dbPath = join(root, 'deltadot.sqlite');
  let store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
  const report = { tabId: 'tab-1', title: 'Current report', rows: [{ mapping: { id: 'mapping-1' }, prs: [] }] };
  store.saveCurrentReport('workspace-1', report);
  store.close();
  store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
  try {
    assert.deepEqual(store.loadCurrentReport('workspace-1'), report);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('upgrades schema v1 and preserves duplicate PR rows', () => {
  const root = makeRoot();
  const dbPath = join(root, 'deltadot.sqlite');
  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`
    CREATE TABLE prs (workspace TEXT NOT NULL, repo_name TEXT NOT NULL, pr_number INTEGER NOT NULL, position INTEGER NOT NULL, pr_json TEXT NOT NULL, PRIMARY KEY(workspace, repo_name, pr_number));
    INSERT INTO prs VALUES ('/workspace', 'api', 42, 0, '{"number":42,"repoName":"api"}');
    PRAGMA user_version=1;
  `);
  oldDb.close();

  const store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
  try {
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);
    const pr = { number: 42, repoName: 'api', title: 'Same PR', author: '', state: 'open', sourceBranch: '', targetBranch: '', createdAt: '', url: '', approved: false };
    store.saveCache({ workspace: '/workspace', base: 'main', release: 'R1', lastFullSync: '', repos: [], prs: [pr, pr] });
    assert.deepEqual(store.loadCache('/workspace').prs, [pr, pr]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('retains malformed sources and retries without overwriting newer database values', () => {
  const root = makeRoot();
  const legacy = join(root, 'legacy');
  const globalPath = join(legacy, 'config.json');
  writeJson(globalPath, { theme: 'dark' });
  const dbPath = join(root, 'deltadot.sqlite');
  let store = new DeltaDotDatabase(dbPath, legacy);
  store.saveGlobalConfig({ theme: 'light' });
  store.close();
  writeJson(globalPath, { theme: 'dark' });
  const malformed = join(legacy, 'kube-contexts.json');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(malformed, '{ invalid');

  const originalWarn = console.warn;
  console.warn = () => undefined;
  try { store = new DeltaDotDatabase(dbPath, legacy); }
  finally { console.warn = originalWarn; }
  try {
    assert.equal(store.loadGlobalConfig().theme, 'light');
    assert.equal(existsSync(globalPath), false, 'a previously verified import can finish source cleanup on retry');
    assert.equal(existsSync(malformed), true, 'invalid JSON must remain available for recovery');
    assert.equal(store.loadKubeContextSettings() && Object.keys(store.loadKubeContextSettings()).length, 0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('saves mapping preferences and keeps workspace registry removal reversible', () => {
  const root = makeRoot();
  const store = new DeltaDotDatabase(join(root, 'deltadot.sqlite'), join(root, 'legacy'));
  try {
    assert.deepEqual(store.loadMappingColumnPrefs({ 'tab-1': ['repo'] }), { 'tab-1': ['repo'] });
    store.saveMappingColumnPrefs({ 'tab-1': ['deployment'] });
    assert.deepEqual(store.loadMappingColumnPrefs(), { 'tab-1': ['deployment'] });
    const ws = { id: 'ws', name: 'WS', path: '/tmp/ws', color: 'blue', config: { workspace: '/tmp/ws', base: 'main', release: 'R13' } };
    store.saveWorkspaces([ws]);
    store.saveWorkspaces([]);
    assert.deepEqual(store.loadWorkspaces(), []);
    store.saveWorkspaces([{ ...ws, config: { workspace: '/tmp/ws', base: 'develop' } }]);
    assert.deepEqual(store.loadWorkspaces(), [ws], 're-adding a removed workspace keeps its saved config');
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});


test('workspace copies sharing a folder keep independent settings and existing IDs', () => {
  const root = makeRoot();
  const dbPath = join(root, 'deltadot.sqlite');
  const folder = join(root, 'project');
  let store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
  const original = { id: folder, name: 'Original', path: folder, color: 'blue', config: { workspace: folder, base: 'main', release: 'release', token: 'secret' } };
  const copy = { ...original, id: 'copy-id', name: 'Copy', config: { ...original.config } };
  try {
    store.saveWorkspaces([original]);
    store.saveWorkspaces([original, copy]);
    const changed = { ...copy, config: { ...copy.config, base: 'develop' } };
    store.saveWorkspaces([original, changed]);
    assert.equal(store.loadWorkspaceConfig(copy.id).base, 'develop');
    assert.equal(store.loadWorkspaceConfig(original.id).base, 'main');
    assert.equal(store.loadWorkspaceConfig(copy.id).token, 'secret');
    const moved = { ...changed, path: join(root, 'other'), config: { ...changed.config, workspace: join(root, 'other') } };
    store.saveWorkspaces([original, moved]);
    store.saveActiveWorkspaceId(copy.id);
    store.close();
    store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
    assert.equal(store.loadActiveWorkspaceId(), copy.id);
    assert.deepEqual(store.loadWorkspaces(), [original, moved]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});


test('workspace sync starts only when its repository cache is missing or incompatible', () => {
  const config = { base: 'main', release: 'release' };
  const cache = { ...config, repos: [{ path: '/workspace/api' }] };
  assert.equal(workspaceNeedsInitialSync(['/workspace/api'], null, config), true);
  assert.equal(workspaceNeedsInitialSync(['/workspace/api'], cache, config), false);
  assert.equal(workspaceNeedsInitialSync(['/workspace/api'], { ...cache, repos: [{ path: '/workspace/api', status: 'stale' }] }, config), true);
  assert.equal(workspaceNeedsInitialSync(['/workspace/api', '/workspace/web'], cache, config), true);
  assert.equal(workspaceNeedsInitialSync(['/workspace/api'], cache, { ...config, release: 'other' }), true);
  assert.equal(workspaceNeedsInitialSync([], null, config), false);
});


test('removing workspaces preserves folders and restores a valid selection after reopening', () => {
  const root = makeRoot();
  const dbPath = join(root, 'deltadot.sqlite');
  const folder = join(root, 'project');
  mkdirSync(folder);
  let store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
  const first = { id: 'first', name: 'First', path: folder, color: 'blue', config: { workspace: folder } };
  const second = { ...first, id: 'second', name: 'Second' };
  try {
    store.saveGlobalConfig({ workspace: folder, theme: 'light' });
    store.saveWorkspaces([first, second]);
    store.saveActiveWorkspaceId('first');
    assert.deepEqual(store.removeWorkspace('first'), [second]);
    assert.equal(store.loadActiveWorkspaceId(), 'second');
    assert.equal(existsSync(folder), true);
    store.close();
    store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
    assert.equal(store.loadActiveWorkspaceId(), 'second');
    assert.deepEqual(store.removeWorkspace('second'), []);
    store.close();
    store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
    assert.deepEqual(store.loadWorkspaces(), []);
    assert.equal(store.loadActiveWorkspaceId(), null);
    assert.equal(store.loadGlobalConfig().workspace, '');
    assert.equal(store.loadGlobalConfig().theme, 'light');
    assert.equal(existsSync(folder), true);
    assert.equal(store.loadWorkspaceConfig('first').workspace, folder);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});


test('comparison caches coexist for each branch pair and restore after reopen', () => {
  const root = makeRoot();
  const dbPath = join(root, 'deltadot.sqlite');
  let store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
  const first = { workspace: '/workspace', base: 'main', release: 'R1', lastFullSync: 'first', repos: [], prs: [] };
  const second = { ...first, release: 'R2', lastFullSync: 'second' };
  try {
    store.saveCache(first);
    store.saveCache(second);
    assert.deepEqual(store.loadCache('/workspace', 'main', 'R1'), first);
    assert.deepEqual(store.loadCache('/workspace', 'main', 'R2'), second);
    assert.equal(store.loadCache('/workspace', 'main', 'R3'), null);
    store.close();
    store = new DeltaDotDatabase(dbPath, join(root, 'legacy'));
    assert.deepEqual(store.loadCache('/workspace', 'main', 'R1'), first);
    assert.deepEqual(store.loadCache('/workspace', 'main', 'R2'), second);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test('a legacy cache remains available after syncing a different comparison', () => {
  const root = makeRoot();
  const store = new DeltaDotDatabase(join(root, 'db.sqlite'), join(root, 'legacy'));
  const first = { workspace: '/legacy', base: 'main', release: 'R1', lastFullSync: 'first', repos: [] };
  const second = { ...first, release: 'R2', lastFullSync: 'second' };
  try {
    store.saveCache(first);
    store.db.prepare('DELETE FROM comparison_cache').run();
    assert.deepEqual(store.loadCache('/legacy', 'main', 'R1'), first);
    store.saveCache(second);
    assert.deepEqual(store.loadCache('/legacy', 'main', 'R1'), first);
    assert.deepEqual(store.loadCache('/legacy', 'main', 'R2'), second);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test('branch shortcut cycles from the active or legacy default pair', () => {
  const pairs = [{ id: 'first', base: 'main', release: 'R1' }, { id: 'second', base: 'main', release: 'R2' }, { id: 'third', base: 'main', release: 'R3' }];
  assert.equal(nextBranchPair(pairs, undefined)?.id, 'second');
  assert.equal(nextBranchPair(pairs, 'missing')?.id, 'second');
  assert.equal(nextBranchPair(pairs, 'first')?.id, 'second');
  assert.equal(nextBranchPair(pairs, 'third')?.id, 'first');
  assert.equal(nextBranchPair(pairs.slice(0, 1), 'first'), null);
  assert.equal(nextBranchPair([], undefined), null);
});
