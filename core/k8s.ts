// Kubernetes client wrapper — Node-only (uses @kubernetes/client-node).
// Reads the local kubeconfig (KUBECONFIG env / ~/.kube/config) and talks to
// the cluster's API server. Never import from renderer code.
import * as k8s from '@kubernetes/client-node';
import type {
  KubeContext,
  KubeContainer,
  KubeContainerPort,
  KubeDeploymentDetail,
  KubeDeploymentSummary,
  KubeEnvVar,
  KubeProbe,
  KubeResourceColumn,
  KubeResourceItem,
  KubeResourceList,
  KubeResourceSpec,
} from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function describeError(err: unknown, contextName: string): string {
  if (err instanceof k8s.ApiException) {
    const code = err.code ?? '';
    if (code === 401) {
      return `Unauthorized for context '${contextName}' — check your kubeconfig credentials.`;
    }
    if (code === 403) {
      return `Forbidden for context '${contextName}' — your credentials lack access to this cluster.`;
    }
    return `Kubernetes API error (${code}): ${err.message}`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|ETIMEDOUT/i.test(msg)) {
    return `Cannot reach cluster for context '${contextName}' — is it running and is your kubeconfig valid?`;
  }
  return msg;
}

function makeConfig(contextName: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  if (contextName) kc.setCurrentContext(contextName);
  if (kc.getContexts().length === 0) {
    throw new Error('No kubeconfig found. Create ~/.kube/config (or set KUBECONFIG) first.');
  }
  return kc;
}

function iso(ts: unknown): string {
  if (!ts) return '';
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? '' : ts.toISOString();
  const s = String(ts);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function fmtProbe(probe: any): KubeProbe | null {
  if (!probe) return null;
  const parts: string[] = [];
  if (probe.httpGet) {
    const p = probe.httpGet;
    parts.push(`httpGet ${p.path || '/'}:${p.port ?? ''}`);
  } else if (probe.exec?.command) {
    parts.push(`exec [${(probe.exec.command as string[]).join(' ')}]`);
  } else if (probe.tcpSocket) {
    parts.push(`tcpSocket :${probe.tcpSocket.port}`);
  } else if (probe.grpc) {
    parts.push(`grpc :${probe.grpc.port}${probe.grpc.service ? ` (${probe.grpc.service})` : ''}`);
  } else {
    parts.push('(none)');
  }
  const timing: string[] = [];
  if (probe.initialDelaySeconds != null) timing.push(`delay ${probe.initialDelaySeconds}s`);
  if (probe.timeoutSeconds != null) timing.push(`timeout ${probe.timeoutSeconds}s`);
  if (probe.periodSeconds != null) timing.push(`period ${probe.periodSeconds}s`);
  if (probe.successThreshold != null) timing.push(`success ${probe.successThreshold}`);
  if (probe.failureThreshold != null) timing.push(`fail ${probe.failureThreshold}`);
  if (timing.length > 0) parts.push(`(${timing.join(', ')})`);
  return {
    type: probe.httpGet ? 'httpGet' : probe.exec ? 'exec' : probe.tcpSocket ? 'tcpSocket' : probe.grpc ? 'grpc' : 'none',
    detail: parts.join(' '),
    initialDelaySeconds: probe.initialDelaySeconds,
    periodSeconds: probe.periodSeconds,
  };
}

function fmtEnvValueFrom(vf: any): string | undefined {
  if (!vf) return undefined;
  if (vf.secretKeyRef) return `secretRef:${vf.secretKeyRef.name}/${vf.secretKeyRef.key}`;
  if (vf.configMapKeyRef) return `configMapRef:${vf.configMapKeyRef.name}/${vf.configMapKeyRef.key}`;
  if (vf.fieldRef) return `fieldRef:${vf.fieldRef.fieldPath}`;
  if (vf.resourceFieldRef) return `resourceFieldRef:${vf.resourceFieldRef.resource}`;
  return 'ref';
}

function fmtPorts(ports: any[] | undefined): KubeContainerPort[] {
  return (ports ?? []).map((p) => ({
    name: p.name,
    containerPort: p.containerPort ?? 0,
    protocol: p.protocol,
  }));
}

function fmtResources(r: any): KubeResourceSpec | undefined {
  if (!r) return undefined;
  const out: KubeResourceSpec = {};
  if (r.requests) out.requests = { ...r.requests };
  if (r.limits) out.limits = { ...r.limits };
  return Object.keys(out).length > 0 ? out : undefined;
}

function fmtContainer(c: any): KubeContainer {
  const env: KubeEnvVar[] = (c.env ?? []).map((e: any) => ({
    name: e.name,
    value: e.value,
    valueFrom: fmtEnvValueFrom(e.valueFrom),
  }));
  return {
    name: c.name,
    image: c.image ?? '',
    imagePullPolicy: c.imagePullPolicy,
    ports: fmtPorts(c.ports),
    env,
    resources: fmtResources(c.resources),
    command: c.command,
    args: c.args,
    livenessProbe: fmtProbe(c.livenessProbe),
    readinessProbe: fmtProbe(c.readinessProbe),
    startupProbe: fmtProbe(c.startupProbe),
  };
}

/** Newest update time across the deployment's status conditions (ISO), '' when none. */
function lastUpdatedOf(d: any): string {
  const conds: any[] = d.status?.conditions ?? [];
  let latest = '';
  for (const c of conds) {
    const t = c?.lastUpdateTime ?? c?.lastTransitionTime;
    if (!t) continue;
    const s = iso(t);
    if (s > latest) latest = s;
  }
  return latest;
}

function toSummary(d: any): KubeDeploymentSummary {
  const c = d.spec?.template?.spec?.containers?.[0];
  return {
    name: d.metadata?.name ?? '',
    namespace: d.metadata?.namespace ?? '',
    image: c?.image ?? '',
    replicas: d.spec?.replicas ?? 0,
    ready: d.status?.readyReplicas ?? 0,
    available: d.status?.availableReplicas ?? 0,
    updated: d.status?.updatedReplicas ?? 0,
    strategy: d.spec?.strategy?.type ?? '',
    createdAt: iso(d.metadata?.creationTimestamp),
    lastUpdated: lastUpdatedOf(d),
  };
}

function toDetail(d: any): KubeDeploymentDetail {
  return {
    name: d.metadata?.name ?? '',
    namespace: d.metadata?.namespace ?? '',
    createdAt: iso(d.metadata?.creationTimestamp),
    labels: d.metadata?.labels ?? {},
    annotations: d.metadata?.annotations ?? {},
    replicas: d.spec?.replicas ?? 0,
    ready: d.status?.readyReplicas ?? 0,
    available: d.status?.availableReplicas ?? 0,
    updated: d.status?.updatedReplicas ?? 0,
    strategyType: d.spec?.strategy?.type ?? '',
    maxSurge: d.spec?.strategy?.rollingUpdate?.maxSurge,
    maxUnavailable: d.spec?.strategy?.rollingUpdate?.maxUnavailable,
    selector: d.spec?.selector?.matchLabels ?? {},
    containers: (d.spec?.template?.spec?.containers ?? []).map(fmtContainer),
    conditions: (d.status?.conditions ?? []).map((c: any) => ({
      type: c.type ?? '',
      status: c.status ?? '',
      reason: c.reason ?? c.message ?? '',
    })),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getKubeContexts(): Promise<KubeContext[]> {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const current = kc.getCurrentContext();
  return kc.getContexts().map((c) => ({
    name: c.name ?? '',
    cluster: c.cluster ?? '',
    namespace: c.namespace ?? '',
    current: c.name === current,
  }));
}

export async function getKubeNamespaces(contextName: string): Promise<string[]> {
  const kc = makeConfig(contextName);
  const core = kc.makeApiClient(k8s.CoreV1Api);
  try {
    const res: any = await core.listNamespace();
    return (res.items ?? []).map((n: any) => n.metadata?.name ?? '').filter(Boolean).sort();
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function getKubeDeployments(
  contextName: string,
  namespace: string,
): Promise<KubeDeploymentSummary[]> {
  const kc = makeConfig(contextName);
  const apps = kc.makeApiClient(k8s.AppsV1Api);
  try {
    let res: any;
    if (!namespace || namespace === '*') {
      res = await apps.listDeploymentForAllNamespaces({});
    } else {
      res = await apps.listNamespacedDeployment({ namespace });
    }
    const items: any[] = res?.items ?? [];
    return items.map(toSummary).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function getKubeDeploymentDetail(
  contextName: string,
  namespace: string,
  name: string,
): Promise<KubeDeploymentDetail> {
  const kc = makeConfig(contextName);
  const apps = kc.makeApiClient(k8s.AppsV1Api);
  try {
    const res: any = await apps.readNamespacedDeployment({ name, namespace });
    return toDetail(res);
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

// ─── Generic namespace resources (pods, configmaps, secrets, …) ─────────────

const EMPTY_RESOURCE: KubeResourceList = { kind: '', columns: [], items: [] };

function ageOf(item: any): string {
  return iso(item?.metadata?.creationTimestamp);
}

function durationBetween(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return '—';
  const secs = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  if (Number.isNaN(secs) || secs < 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

interface ResourceSpec {
  apiVersion: string;
  kind: string;
  columns: KubeResourceColumn[];
  extract: (item: any) => Record<string, string>;
}

const RESOURCE_SPECS: Record<string, ResourceSpec> = {
  deployments: {
    apiVersion: 'apps/v1', kind: 'Deployment',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'ready', label: 'READY', format: 'ready' },
      { key: 'image', label: 'IMAGE', format: 'image' },
      { key: 'strategy', label: 'STRATEGY' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (d) => {
      const c = d?.spec?.template?.spec?.containers?.[0];
      return {
        name: d?.metadata?.name ?? '', namespace: d?.metadata?.namespace ?? '',
        ready: `${d?.status?.readyReplicas ?? 0}/${d?.spec?.replicas ?? 0}`,
        image: c?.image ?? '',
        strategy: d?.spec?.strategy?.type ?? '',
        age: ageOf(d),
      };
    },
  },
  pods: {
    apiVersion: 'v1', kind: 'Pod',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'ready', label: 'READY', format: 'ready' },
      { key: 'status', label: 'STATUS' },
      { key: 'restarts', label: 'RESTARTS' },
      { key: 'ip', label: 'IP' },
      { key: 'node', label: 'NODE' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (p) => {
      const cs = p?.status?.containerStatuses ?? [];
      const ready = cs.filter((c: any) => c?.ready).length;
      const restarts = cs.reduce((n: number, c: any) => n + (c?.restartCount ?? 0), 0);
      return {
        name: p?.metadata?.name ?? '', namespace: p?.metadata?.namespace ?? '',
        ready: `${ready}/${cs.length}`,
        status: p?.status?.phase ?? '',
        restarts: String(restarts),
        ip: p?.status?.podIP ?? '',
        node: p?.spec?.nodeName ?? '',
        age: ageOf(p),
      };
    },
  },
  configmaps: {
    apiVersion: 'v1', kind: 'ConfigMap',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'data', label: 'DATA' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (c) => ({
      name: c?.metadata?.name ?? '', namespace: c?.metadata?.namespace ?? '',
      data: String(Object.keys(c?.data ?? {}).length + Object.keys(c?.binaryData ?? {}).length),
      age: ageOf(c),
    }),
  },
  secrets: {
    apiVersion: 'v1', kind: 'Secret',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'type', label: 'TYPE' },
      { key: 'data', label: 'DATA' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (s) => ({
      name: s?.metadata?.name ?? '', namespace: s?.metadata?.namespace ?? '',
      type: s?.type ?? 'Opaque',
      data: String(Object.keys(s?.data ?? {}).length),
      age: ageOf(s),
    }),
  },
  services: {
    apiVersion: 'v1', kind: 'Service',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'type', label: 'TYPE' },
      { key: 'clusterIp', label: 'CLUSTER-IP' },
      { key: 'externalIp', label: 'EXTERNAL-IP' },
      { key: 'ports', label: 'PORT(S)' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (s) => ({
      name: s?.metadata?.name ?? '', namespace: s?.metadata?.namespace ?? '',
      type: s?.spec?.type ?? 'ClusterIP',
      clusterIp: s?.spec?.clusterIP ?? '',
      externalIp: (s?.status?.loadBalancer?.ingress ?? []).map((i: any) => i?.ip || i?.hostname || '').filter(Boolean).join(', '),
      ports: (s?.spec?.ports ?? []).map((p: any) => `${p?.port ?? ''}${p?.nodePort ? `:${p.nodePort}` : ''}/${p?.protocol ?? 'TCP'}`).join(', '),
      age: ageOf(s),
    }),
  },
  statefulsets: {
    apiVersion: 'apps/v1', kind: 'StatefulSet',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'ready', label: 'READY', format: 'ready' },
      { key: 'image', label: 'IMAGE', format: 'image' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (d) => ({
      name: d?.metadata?.name ?? '', namespace: d?.metadata?.namespace ?? '',
      ready: `${d?.status?.readyReplicas ?? 0}/${d?.spec?.replicas ?? 0}`,
      image: d?.spec?.template?.spec?.containers?.[0]?.image ?? '',
      age: ageOf(d),
    }),
  },
  daemonsets: {
    apiVersion: 'apps/v1', kind: 'DaemonSet',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'ready', label: 'READY', format: 'ready' },
      { key: 'image', label: 'IMAGE', format: 'image' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (d) => ({
      name: d?.metadata?.name ?? '', namespace: d?.metadata?.namespace ?? '',
      ready: `${d?.status?.numberReady ?? 0}/${d?.status?.desiredNumberScheduled ?? 0}`,
      image: d?.spec?.template?.spec?.containers?.[0]?.image ?? '',
      age: ageOf(d),
    }),
  },
  ingresses: {
    apiVersion: 'networking.k8s.io/v1', kind: 'Ingress',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'class', label: 'CLASS' },
      { key: 'hosts', label: 'HOSTS' },
      { key: 'address', label: 'ADDRESS' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (i) => ({
      name: i?.metadata?.name ?? '', namespace: i?.metadata?.namespace ?? '',
      class: i?.spec?.ingressClassName ?? '',
      hosts: (i?.spec?.rules ?? []).map((r: any) => r?.host || '').filter(Boolean).join(', '),
      address: (i?.status?.loadBalancer?.ingress ?? []).map((x: any) => x?.ip || x?.hostname || '').filter(Boolean).join(', '),
      age: ageOf(i),
    }),
  },
  jobs: {
    apiVersion: 'batch/v1', kind: 'Job',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'completions', label: 'COMPLETIONS' },
      { key: 'duration', label: 'DURATION' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (j) => {
      const start = iso(j?.status?.startTime);
      const end = iso(j?.status?.completionTime);
      return {
        name: j?.metadata?.name ?? '', namespace: j?.metadata?.namespace ?? '',
        completions: `${j?.status?.succeeded ?? 0}/${j?.spec?.completions ?? 1}`,
        duration: durationBetween(start, end),
        age: ageOf(j),
      };
    },
  },
  cronjobs: {
    apiVersion: 'batch/v1', kind: 'CronJob',
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'namespace', label: 'NAMESPACE' },
      { key: 'schedule', label: 'SCHEDULE' },
      { key: 'suspend', label: 'SUSPEND' },
      { key: 'active', label: 'ACTIVE' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (c) => ({
      name: c?.metadata?.name ?? '', namespace: c?.metadata?.namespace ?? '',
      schedule: c?.spec?.schedule ?? '',
      suspend: String(c?.spec?.suspend ?? false),
      active: String(c?.status?.active?.length ?? 0),
      age: ageOf(c),
    }),
  },
};

export async function getKubeResources(
  contextName: string,
  namespace: string,
  kindId: string,
): Promise<KubeResourceList> {
  const spec = RESOURCE_SPECS[kindId];
  if (!spec) return EMPTY_RESOURCE;
  const kc = makeConfig(contextName);
  const api = kc.makeApiClient(k8s.KubernetesObjectApi);
  try {
    const res: any = await api.list(spec.apiVersion, spec.kind, (!namespace || namespace === '*') ? undefined : namespace);
    const items: any[] = res?.items ?? [];
    return {
      kind: kindId,
      columns: spec.columns,
      items: items.map((item) => {
        const cells = spec.extract(item);
        return {
          key: `${cells.namespace}/${cells.name}`,
          name: cells.name,
          namespace: cells.namespace,
          cells,
        } as KubeResourceItem;
      }),
    };
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}
