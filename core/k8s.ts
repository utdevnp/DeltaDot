// Kubernetes client wrapper — Node-only (uses @kubernetes/client-node).
// Reads the local kubeconfig (KUBECONFIG env / ~/.kube/config) and talks to
// the cluster's API server. Never import from renderer code.
import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'node:stream';
import type {
  KubeContext,
  KubeContainer,
  KubeContainerPort,
  KubeDeploymentDetail,
  KubeDeploymentSummary,
  KubeEnvVar,
  KubeProbe,
  KubeResourceColumn,
  KubeResourceKind,
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

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
    || err instanceof Error && err.name === 'AbortError';
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

function resourceUpdatedAt(kindId: string, item: any): string {
  const created = iso(item?.metadata?.creationTimestamp);
  if (kindId === 'deployments') return lastUpdatedOf(item) || created;
  if (kindId !== 'pods') return created;
  const timestamps: string[] = [
    ...(item?.status?.conditions ?? []).flatMap((condition: any) => [condition?.lastTransitionTime, condition?.lastUpdateTime]),
    ...(item?.status?.containerStatuses ?? []).flatMap((container: any) => [container?.state?.running?.startedAt, container?.state?.terminated?.finishedAt]),
  ].map(iso).filter(Boolean);
  return timestamps.sort().at(-1) || created;
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

export async function getKubeDeploymentPods(
  contextName: string,
  namespace: string,
  name: string,
): Promise<KubeResourceList> {
  const kc = makeConfig(contextName);
  const apps = kc.makeApiClient(k8s.AppsV1Api);
  try {
    const deployment: any = await apps.readNamespacedDeployment({ name, namespace });
    const deploymentSelector = deployment.spec?.selector ?? {};
    const selectorParts = Object.entries(deploymentSelector.matchLabels ?? {})
      .map(([key, value]) => `${key}=${value}`);
    for (const expression of deploymentSelector.matchExpressions ?? []) {
      const values = (expression.values ?? []).join(',');
      if (expression.operator === 'In') selectorParts.push(`${expression.key} in (${values})`);
      else if (expression.operator === 'NotIn') selectorParts.push(`${expression.key} notin (${values})`);
      else if (expression.operator === 'Exists') selectorParts.push(expression.key);
      else if (expression.operator === 'DoesNotExist') selectorParts.push(`!${expression.key}`);
    }
    const selector = selectorParts.join(',');
    const core = kc.makeApiClient(k8s.CoreV1Api);
    const res: any = await core.listNamespacedPod({ namespace, labelSelector: selector || undefined });
    const pods = ((res.items ?? []) as any[]).sort((a, b) =>
      String(a.metadata?.name ?? '').localeCompare(String(b.metadata?.name ?? '')),
    );
    const items = pods.map((pod) => ({
      key: `${pod.metadata?.namespace ?? namespace}/${pod.metadata?.name ?? ''}`,
      name: pod.metadata?.name ?? '',
      namespace: pod.metadata?.namespace ?? namespace,
      cells: RESOURCE_SPECS.pods.extract(pod),
      containers: (pod.spec?.containers ?? []).map((container: any) => container.name).filter(Boolean),
      containerStatuses: podContainerStatuses(pod),
    } as KubeResourceItem));
    await addPodMetrics(contextName, pods, items, namespace);
    return {
      kind: 'pods',
      columns: RESOURCE_SPECS.pods.columns,
      items,
    };
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function getKubePodLogs(
  contextName: string,
  namespace: string,
  name: string,
  container?: string,
  tailLines?: number,
): Promise<string> {
  const kc = makeConfig(contextName);
  const core = kc.makeApiClient(k8s.CoreV1Api);
  try {
    const pod: any = await core.readNamespacedPod({ name, namespace });
    const selectedContainer = container || pod.spec?.containers?.[0]?.name;
    const logOptions: any = {
      name,
      namespace,
      container: selectedContainer,
      timestamps: true,
    };
    if (tailLines !== undefined) logOptions.tailLines = tailLines;
    const result: any = await core.readNamespacedPodLog(logOptions);
    return typeof result === 'string' ? result : String(result ?? '');
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function streamKubePodLogs(
  contextName: string,
  namespace: string,
  name: string,
  container: string | undefined,
  onChunk: (chunk: string) => void,
  onEnd: () => void,
  onError: (error: unknown) => void,
): Promise<AbortController> {
  const kc = makeConfig(contextName);
  try {
    const pod: any = await kc.makeApiClient(k8s.CoreV1Api).readNamespacedPod({ name, namespace });
    const selectedContainer = container || pod.spec?.containers?.[0]?.name;
    if (!selectedContainer) throw new Error(`No container found for pod '${name}'.`);
    const output = new PassThrough();
    output.setEncoding('utf8');
    output.on('data', (chunk: string) => onChunk(chunk));
    output.on('end', onEnd);
    output.on('error', (err) => {
      if (!isAbortError(err)) onError(err);
    });
    return await new k8s.Log(kc).log(namespace, name, selectedContainer, output, {
      follow: true,
      tailLines: 1,
      timestamps: true,
    });
  } catch (err) {
    if (!isAbortError(err)) onError(err);
    if (isAbortError(err)) return new AbortController();
    throw new Error(describeError(err, contextName));
  }
}

export async function restartKubeDeployment(
  contextName: string,
  namespace: string,
  name: string,
): Promise<void> {
  const kc = makeConfig(contextName);
  const apps = kc.makeApiClient(k8s.AppsV1Api);
  try {
    const deployment: any = await apps.readNamespacedDeployment({ name, namespace });
    deployment.spec ??= {};
    deployment.spec.template ??= {};
    deployment.spec.template.metadata ??= {};
    deployment.spec.template.metadata.annotations ??= {};
    deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();
    await apps.replaceNamespacedDeployment({
      name,
      namespace,
      body: deployment,
    });
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function restartAllKubeDeployments(contextName: string, namespace: string): Promise<number> {
  const deployments = await getKubeDeployments(contextName, namespace);
  await Promise.all(deployments.map((deployment) => restartKubeDeployment(contextName, deployment.namespace, deployment.name)));
  return deployments.length;
}

export async function deleteKubeJob(
  contextName: string,
  namespace: string,
  name: string,
): Promise<void> {
  const kc = makeConfig(contextName);
  try {
    await kc.makeApiClient(k8s.BatchV1Api).deleteNamespacedJob({ name, namespace });
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function deleteKubeResource(
  contextName: string,
  namespace: string,
  kind: KubeResourceKind,
  name: string,
): Promise<void> {
  const spec = RESOURCE_SPECS[kind];
  if (!spec) throw new Error(`Unsupported Kubernetes resource kind: ${kind}`);
  const kc = makeConfig(contextName);
  try {
    await kc.makeApiClient(k8s.KubernetesObjectApi).delete({
      apiVersion: spec.apiVersion,
      kind: spec.kind,
      metadata: { name, ...(spec.namespaced === false ? {} : { namespace }) },
    });
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

export async function describeKubeResource(
  contextName: string,
  namespace: string,
  kind: KubeResourceKind,
  name: string,
): Promise<string> {
  const kc = makeConfig(contextName);
  try {
    const spec = RESOURCE_SPECS[kind];
    if (!spec) throw new Error(`Unsupported Kubernetes resource kind: ${kind}`);
    const resourceApi = kc.makeApiClient(k8s.KubernetesObjectApi);
    const resource = await resourceApi.read({
      apiVersion: spec.apiVersion,
      kind: spec.kind,
      metadata: { name, ...(spec.namespaced === false ? {} : { namespace }) },
    });
    if (kind === 'pods') {
      (resource as any).__deltadot = { ingresses: await findPodIngresses(contextName, namespace, resource as any) };
    }
    return JSON.stringify(resource, null, 2);
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}

/** Find ingress routes that can reach a pod through a matching Service selector. */
async function findPodIngresses(contextName: string, namespace: string, pod: any): Promise<Array<Record<string, string>>> {
  try {
    const kc = makeConfig(contextName);
    const core = kc.makeApiClient(k8s.CoreV1Api);
    const networking = kc.makeApiClient(k8s.NetworkingV1Api);
    const [serviceResult, ingressResult] = await Promise.all([
      core.listNamespacedService({ namespace }),
      networking.listNamespacedIngress({ namespace }),
    ]);
    const labels = pod?.metadata?.labels ?? {};
    const services = (serviceResult.items ?? []).filter((service: any) => {
      const selector = service?.spec?.selector ?? {};
      const entries = Object.entries(selector);
      return entries.length > 0 && entries.every(([key, value]) => labels[key] === value);
    });
    const serviceNames = new Set(services.map((service: any) => service.metadata?.name).filter(Boolean));
    if (!serviceNames.size) return [];
    const result: Array<Record<string, string>> = [];
    for (const ingress of ingressResult.items ?? []) {
      const address = (ingress.status?.loadBalancer?.ingress ?? [])
        .map((entry: any) => entry?.ip ?? entry?.hostname ?? '')
        .filter(Boolean)
        .join(', ');
      for (const rule of ingress.spec?.rules ?? []) {
        for (const path of rule.http?.paths ?? []) {
          const backend = path.backend?.service;
          if (!backend?.name || !serviceNames.has(backend.name)) continue;
          result.push({
            ingress: ingress.metadata?.name ?? '',
            host: rule.host ?? '*',
            path: path.path ?? '/',
            service: backend.name,
            port: String(backend.port?.number ?? backend.port?.name ?? '—'),
            address: address || '—',
          });
        }
      }
    }
    return result;
  } catch {
    // Ingress/service permissions are optional; the Pod inspector still works.
    return [];
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

/** Summarize the pod's container resource requests and limits for table display. */
function podResource(pod: any, resource: 'cpu' | 'memory'): string {
  const values = (pod?.spec?.containers ?? [])
    .map((container: any) => {
      const requests = container?.resources?.requests?.[resource];
      const limits = container?.resources?.limits?.[resource];
      if (!requests && !limits) return '';
      if (requests && limits) return `${requests}/${limits}`;
      return requests ? `${requests}/—` : `—/${limits}`;
    })
    .filter(Boolean);
  return values.length > 0 ? values.join(', ') : '—';
}

function quantityValue(value: unknown, resource: 'cpu' | 'memory'): number | null {
  if (value == null || value === '') return null;
  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)([a-zA-Z]*)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (resource === 'cpu') {
    if (match[2] === 'n') return amount / 1e9;
    if (match[2] === 'u') return amount / 1e6;
    if (match[2] === 'm') return amount / 1000;
    return amount;
  }
  const multipliers: Record<string, number> = { '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6 };
  return multipliers[match[2]] == null ? null : amount * multipliers[match[2]];
}

function formatUsage(value: number, resource: 'cpu' | 'memory'): string {
  if (resource === 'cpu') return `${Math.round(value * 1000)}m`;
  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
  let unit = 0;
  let scaled = value;
  while (scaled >= 1024 && unit < units.length - 1) { scaled /= 1024; unit += 1; }
  return `${Number(scaled.toFixed(scaled >= 10 ? 0 : 1))}${units[unit]}`;
}

function podResourceTotal(pod: any, resource: 'cpu' | 'memory', field: 'requests' | 'limits'): number | null {
  const values = (pod?.spec?.containers ?? [])
    .map((container: any) => quantityValue(container?.resources?.[field]?.[resource], resource))
    .filter((value: number | null): value is number => value != null);
  return values.length > 0 ? values.reduce((total: number, value: number) => total + value, 0) : null;
}

async function loadPodMetrics(contextName: string, namespace?: string): Promise<Map<string, any>> {
  try {
    // Use the client's dedicated metrics wrapper rather than the generic
    // object API. It targets metrics.k8s.io/v1beta1 directly and handles the
    // metrics-server response shape consistently across cluster versions.
    const result = await new k8s.Metrics(makeConfig(contextName)).getPodMetrics(namespace);
    return new Map((result?.items ?? []).map((pod: any) => [`${pod?.metadata?.namespace ?? ''}/${pod?.metadata?.name ?? ''}`, pod]));
  } catch {
    // Live usage is optional: clusters without metrics-server still show the
    // configured requests/limits from the Pod spec.
    return new Map();
  }
}

async function addPodMetrics(contextName: string, rawPods: any[], items: KubeResourceItem[], namespace?: string): Promise<void> {
  const metrics = await loadPodMetrics(contextName, namespace);
  rawPods.forEach((pod, index) => {
    const metric = metrics.get(`${pod?.metadata?.namespace ?? namespace ?? ''}/${pod?.metadata?.name ?? ''}`);
    const item = items[index];
    if (!metric || !item) return;
    for (const resource of ['cpu', 'memory'] as const) {
      const usage = (metric?.containers ?? []).map((container: any) => quantityValue(container?.usage?.[resource], resource))
        .filter((value: number | null): value is number => value != null)
        .reduce((total: number, value: number) => total + value, 0);
      const limit = podResourceTotal(pod, resource, 'limits');
      item.cells[`${resource}MetricsAvailable`] = 'true';
      item.cells[resource] = `${formatUsage(usage, resource)}${limit != null ? `/${formatUsage(limit, resource)}` : ''}`;
      if (limit != null && limit > 0 && usage / limit >= 0.8) item.cells[`high${resource === 'cpu' ? 'Cpu' : 'Memory'}`] = 'true';
    }
  });
}

interface ResourceSpec {
  apiVersion: string;
  kind: string;
  namespaced?: boolean;
  columns: KubeResourceColumn[];
  extract: (item: any) => Record<string, string>;
  /** Return true to exclude the item from the table (e.g. migration/cronjob pods). */
  exclude?: (item: any) => boolean;
}

/** Return the pod's actual Kubernetes status/reason for display. */
function podHealthStatus(p: any, containerStatuses: any[]): string {
  const phase = p?.status?.phase ?? 'Unknown';
  if (p?.metadata?.deletionTimestamp) return 'Terminating';
  const initStatuses = p?.status?.initContainerStatuses ?? [];
  const errorReasons = new Set([
    'CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerError',
    'RunContainerError', 'InvalidImageName', 'OOMKilled', 'Evicted', 'Error',
  ]);
  const initError = initStatuses
    .map((c: any) => c?.state?.waiting?.reason || c?.state?.terminated?.reason)
    .find((reason: string | undefined) => reason && errorReasons.has(reason));
  if (initError) return `Init:${initError}`;

  const initWaiting = initStatuses.map((c: any) => c?.state?.waiting?.reason).find(Boolean);
  if (initWaiting) return `Init:${initWaiting}`;

  const initFailed = initStatuses.find((c: any) => (c?.state?.terminated?.exitCode ?? 0) > 0);
  if (initFailed) return `Init:${initFailed?.state?.terminated?.reason || 'Error'}`;

  const initCompleted = initStatuses.filter((c: any) => c?.state?.terminated?.exitCode === 0).length;
  if (initStatuses.length > 0 && initCompleted < initStatuses.length) return `Init:${initCompleted}/${initStatuses.length}`;

  const errorReason = containerStatuses
    .map((c: any) => c?.state?.waiting?.reason || c?.state?.terminated?.reason)
    .find((reason: string | undefined) => reason && errorReasons.has(reason));
  const failedExit = containerStatuses.find((c: any) => (c?.state?.terminated?.exitCode ?? 0) > 0);

  if (phase === 'Failed' || phase === 'Unknown' || errorReason || failedExit) {
    return errorReason || failedExit?.state?.terminated?.reason || phase;
  }

  const ready = containerStatuses.filter((c: any) => c?.ready).length;
  if (phase === 'Running' && containerStatuses.length > 0 && ready === containerStatuses.length) {
    return phase;
  }
  if (phase === 'Succeeded') return phase;

  const waitingReason = containerStatuses
    .map((c: any) => c?.state?.waiting?.reason)
    .find(Boolean);
  if (waitingReason) return waitingReason;
  if (phase === 'Running' && containerStatuses.length > 0) return 'Running (not ready)';
  return phase;
}

function containerHealthStatus(container: any): string {
  const waiting = container?.state?.waiting;
  const terminated = container?.state?.terminated;
  if (waiting?.reason) return waiting.reason;
  if (terminated) return terminated.exitCode === 0 ? 'Succeeded' : (terminated.reason || 'Error');
  if (container?.state?.running) return container.ready ? 'Running' : 'Running (not ready)';
  return 'Unknown';
}

function podContainerStatuses(pod: any): Record<string, string> {
  return Object.fromEntries((pod?.status?.containerStatuses ?? []).map((container: any) => [
    container.name, containerHealthStatus(container),
  ]));
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
      { key: 'status', label: 'STATUS', format: 'pod-status' },
      { key: 'restarts', label: 'RESTARTS' },
      { key: 'ip', label: 'IP' },
      { key: 'cpu', label: 'CPU', format: 'usage' },
      { key: 'memory', label: 'MEMORY', format: 'usage' },
      { key: 'image', label: 'IMAGE', format: 'image' },
      { key: 'owner', label: 'OWNER' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (p) => {
      const cs = p?.status?.containerStatuses ?? [];
      const ready = cs.filter((c: any) => c?.ready).length;
      const restarts = cs.reduce((n: number, c: any) => n + (c?.restartCount ?? 0), 0);
      return {
        name: p?.metadata?.name ?? '', namespace: p?.metadata?.namespace ?? '',
        ready: `${ready}/${cs.length}`,
        status: podHealthStatus(p, cs),
        restarts: String(restarts),
        ip: p?.status?.podIP ?? '',
        cpu: podResource(p, 'cpu'),
        memory: podResource(p, 'memory'),
        image: (p?.spec?.containers ?? []).map((c: any) => c?.image ?? '').filter(Boolean).join(', '),
        // Owner kind via the Kubernetes owner-reference convention (no name matching):
        // ReplicaSet (deployments), Job, DaemonSet, StatefulSet, or 'None' for standalone pods.
        owner: (p?.metadata?.ownerReferences ?? [])[0]?.kind ?? 'None',
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
  nodes: {
    apiVersion: 'v1', kind: 'Node', namespaced: false,
    columns: [
      { key: 'name', label: 'NAME' },
      { key: 'status', label: 'STATUS' },
      { key: 'roles', label: 'ROLES' },
      { key: 'version', label: 'VERSION' },
      { key: 'internalIp', label: 'INTERNAL-IP' },
      { key: 'osImage', label: 'OS-IMAGE' },
      { key: 'age', label: 'AGE', format: 'age' },
    ],
    extract: (n) => {
      const ready = (n?.status?.conditions ?? []).find((condition: any) => condition?.type === 'Ready');
      const roles = Object.keys(n?.metadata?.labels ?? {})
        .filter((key) => key === 'kubernetes.io/role' || key.startsWith('node-role.kubernetes.io/'))
        .map((key) => key === 'kubernetes.io/role' ? n.metadata.labels[key] : key.replace('node-role.kubernetes.io/', ''))
        .filter(Boolean);
      return {
        name: n?.metadata?.name ?? '', namespace: '',
        status: ready?.status === 'True' ? 'Ready' : ready?.status === 'False' ? (ready.reason || 'NotReady') : 'Unknown',
        roles: roles.length > 0 ? roles.join(', ') : '<none>',
        version: n?.status?.nodeInfo?.kubeletVersion ?? '',
        internalIp: (n?.status?.addresses ?? []).find((address: any) => address?.type === 'InternalIP')?.address ?? '',
        osImage: n?.status?.nodeInfo?.osImage ?? '',
        age: ageOf(n),
      };
    },
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
    const resourceNamespace = spec.namespaced === false || !namespace || namespace === '*' ? undefined : namespace;
    const res: any = await api.list(spec.apiVersion, spec.kind, resourceNamespace);
    const raw: any[] = res?.items ?? [];
    const items = raw.filter((item) => !(spec.exclude?.(item) ?? false));

    const resourceItems = items.map((item) => {
      const cells = spec.extract(item);
      return {
        key: `${cells.namespace ? `${cells.namespace}/` : ''}${cells.name}`,
        name: cells.name,
        namespace: cells.namespace,
        updatedAt: resourceUpdatedAt(kindId, item),
        cells,
          containers: kindId === 'pods'
            ? (item.spec?.containers ?? []).map((container: any) => container.name).filter(Boolean)
            : undefined,
          containerStatuses: kindId === 'pods' ? podContainerStatuses(item) : undefined,
      } as KubeResourceItem;
    });
    if (kindId === 'pods') await addPodMetrics(contextName, items, resourceItems, resourceNamespace);
    return {
      kind: kindId,
      columns: spec.columns,
      items: resourceItems,
    };
  } catch (err) {
    throw new Error(describeError(err, contextName));
  }
}
