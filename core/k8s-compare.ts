// Pure, renderer-safe deployment comparison helper.
// Converts two KubeDeploymentDetail objects into diff sections with
// per-key rows so the UI can highlight what changed between two workloads.
import type {
  KubeContainer,
  KubeDeploymentDetail,
  KubeDeploymentSummary,
  KubeDiffRow,
  KubeDiffSection,
  KubeDiffStatus,
} from './types.js';

function row(key: string, label: string, left: unknown, right: unknown): KubeDiffRow {
  const l = left === undefined || left === null ? undefined : String(left);
  const r = right === undefined || right === null ? undefined : String(right);
  let status: KubeDiffStatus;
  if (l === undefined && r === undefined) status = 'same';
  else if (l === undefined) status = 'right-only';
  else if (r === undefined) status = 'left-only';
  else status = l === r ? 'same' : 'changed';
  return { key, label, left: l, right: r, status };
}

function fmtMap(m?: Record<string, string>): Record<string, string> {
  return m ?? {};
}

function mapRows(prefix: string, labelPrefix: string, a?: Record<string, string>, b?: Record<string, string>): KubeDiffRow[] {
  const left = fmtMap(a);
  const right = fmtMap(b);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.map((k) => row(`${prefix}.${k}`, `${labelPrefix}.${k}`, left[k], right[k]));
}

function fmtPorts(c: KubeContainer): string {
  return c.ports.map((p) => `${p.containerPort}/${p.protocol ?? 'TCP'}${p.name ? ` (${p.name})` : ''}`).join(', ') || '—';
}

function fmtProbe(c: KubeContainer, type: 'livenessProbe' | 'readinessProbe' | 'startupProbe'): string {
  const probe = c[type];
  if (!probe) return '—';
  return `${probe.detail}`;
}

function envMap(c: KubeContainer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of c.env) out[e.name] = e.value ?? e.valueFrom ?? '—';
  return out;
}

function compareContainer(a: KubeDeploymentDetail, b: KubeDeploymentDetail, name: string): KubeDiffSection | null {
  const ca = a.containers.find((c) => c.name === name);
  const cb = b.containers.find((c) => c.name === name);

  // Image rows live in the top-level "Image Version" section — a container that
  // exists on only one side is fully covered there, so skip its section here.
  if (!ca || !cb) return null;

  const rows: KubeDiffRow[] = [
    row(`containers.${name}.imagePullPolicy`, 'imagePullPolicy', ca.imagePullPolicy, cb.imagePullPolicy),
    row(`containers.${name}.ports`, 'ports', fmtPorts(ca), fmtPorts(cb)),
    row(`containers.${name}.command`, 'command', ca.command?.join(' '), cb.command?.join(' ')),
    row(`containers.${name}.args`, 'args', ca.args?.join(' '), cb.args?.join(' ')),
    ...mapRows(`containers.${name}.env`, 'env', envMap(ca), envMap(cb)),
    ...mapRows(`containers.${name}.resources.requests`, 'resources.requests', ca.resources?.requests, cb.resources?.requests),
    ...mapRows(`containers.${name}.resources.limits`, 'resources.limits', ca.resources?.limits, cb.resources?.limits),
    row(`containers.${name}.livenessProbe`, 'livenessProbe', fmtProbe(ca, 'livenessProbe'), fmtProbe(cb, 'livenessProbe')),
    row(`containers.${name}.readinessProbe`, 'readinessProbe', fmtProbe(ca, 'readinessProbe'), fmtProbe(cb, 'readinessProbe')),
    row(`containers.${name}.startupProbe`, 'startupProbe', fmtProbe(ca, 'startupProbe'), fmtProbe(cb, 'startupProbe')),
  ];
  return { title: `Container: ${name}`, rows };
}

// ─── Image-version table ────────────────────────────────────────────────────

export interface KubeImageCompareRow {
  container: string;
  versions: (string | null)[]; // short tag per side, null when the deployment is missing
  images: (string | null)[];   // full image per side (for hover/display)
  lastUpdated: (string | null)[]; // newest status update per side, null when missing
}

/** Extract the short image version tag, e.g. "repo/app:1.11.20" → "1.11.20". */
export function extractImageVersion(image: string): string {
  const last = image.split('/').pop() ?? image;
  return last.split(':').pop() ?? image;
}

/**
 * Build the deployment × context image-version table (rows sorted by deployment
 * name). Each side is one kube context with its deployments in the compared
 * namespace; cells show the primary container's image tag, null when that
 * deployment does not exist in the context.
 */
export function compareContextImages(sides: { context: string; deployments: KubeDeploymentSummary[] }[]): KubeImageCompareRow[] {
  const names = [...new Set(sides.flatMap((s) => s.deployments.map((d) => d.name)))].sort();
  return names.map((name) => ({
    container: name,
    versions: sides.map((s) => {
      const d = s.deployments.find((x) => x.name === name);
      return d ? extractImageVersion(d.image) : null;
    }),
    images: sides.map((s) => {
      const d = s.deployments.find((x) => x.name === name);
      return d ? d.image : null;
    }),
    lastUpdated: sides.map((s) => {
      const d = s.deployments.find((x) => x.name === name);
      return d && d.lastUpdated ? d.lastUpdated : null;
    }),
  }));
}

export function compareDeployments(a: KubeDeploymentDetail, b: KubeDeploymentDetail): KubeDiffSection[] {
  const sections: KubeDiffSection[] = [];

  // Image Version is the FIRST section — one row per container, images side by side.
  const containerNames = [...new Set([
    ...a.containers.map((c) => c.name),
    ...b.containers.map((c) => c.name),
  ])].sort();
  sections.push({
    title: 'Image Version',
    rows: containerNames.map((name) => {
      const ca = a.containers.find((c) => c.name === name);
      const cb = b.containers.find((c) => c.name === name);
      return row(`image.${name}`, name, ca?.image, cb?.image);
    }),
  });

  sections.push({
    title: 'Overview',
    rows: [
      row('overview.namespace', 'namespace', a.namespace, b.namespace),
      row('overview.replicas', 'replicas', a.replicas, b.replicas),
      row('overview.ready', 'ready', a.ready, b.ready),
      row('overview.available', 'available', a.available, b.available),
      row('overview.updated', 'updated', a.updated, b.updated),
      row('overview.strategy', 'strategy', a.strategyType, b.strategyType),
      row('overview.maxSurge', 'maxSurge', a.maxSurge, b.maxSurge),
      row('overview.maxUnavailable', 'maxUnavailable', a.maxUnavailable, b.maxUnavailable),
      row('overview.selector', 'selector', Object.entries(a.selector).map(([k, v]) => `${k}=${v}`).join(', '), Object.entries(b.selector).map(([k, v]) => `${k}=${v}`).join(', ')),
      row('overview.createdAt', 'created', a.createdAt, b.createdAt),
    ],
  });

  const labels = mapRows('labels', 'label', a.labels, b.labels);
  if (labels.length > 0) sections.push({ title: 'Labels', rows: labels });

  const annotations = mapRows('annotations', 'annotation', a.annotations, b.annotations);
  if (annotations.length > 0) sections.push({ title: 'Annotations', rows: annotations });

  for (const name of containerNames) {
    const section = compareContainer(a, b, name);
    if (section && section.rows.length > 0) sections.push(section);
  }

  return sections;
}
