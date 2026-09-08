import { auditShellContainment, type PrintShellReport } from './print-shells';
import { auditSurfaceIntersections, type PrintIntersectionReport } from './print-intersections';
import { getMeshTopology, type TopologyMesh } from './mesh-topology';

export type PrintTopologyIssueCode =
  | 'budget'
  | 'surface-contact'
  | 'shell-orientation'
  | 'shell-indeterminate'
  | 'shell-budget'
  | 'intersection-budget'
  | 'invalid-buffer'
  | 'non-finite-vertex'
  | 'invalid-index'
  | 'degenerate-face'
  | 'non-finite-face'
  | 'duplicate-face'
  | 'short-edge'
  | 'boundary-edge'
  | 'non-manifold-edge'
  | 'inconsistent-winding'
  | 'non-manifold-vertex'
  | 'unused-vertex'
  | 'non-positive-volume';
export type PrintTopologyIssue = {
  code: PrintTopologyIssueCode;
  severity: 'error' | 'warning';
  count: number;
  /** Bounded sample locations; counts describe detected issues. Intersection
   * counts are lower bounds if the report says its work budget was exhausted. */
  vertices: Uint32Array;
  triangles: Uint32Array;
};
type Check =
  | 'buffers'
  | 'faces'
  | 'edges'
  | 'vertexLinks'
  | 'signedVolume'
  | 'nonAdjacentIntersections'
  | 'selfIntersections'
  | 'shellContainment'
  | 'manufacturing';
type CheckState = 'passed' | 'failed' | 'not-run';
export type PrintTopologyReport = {
  /** Topology alone never establishes geometric validity or print readiness. */
  status: 'invalid' | 'topology-checked';
  checks: Record<Check, CheckState>;
  issues: PrintTopologyIssue[];
  intersections: PrintIntersectionReport | null;
  shellContainment: PrintShellReport | null;
  signedVolumeMm3: number | null;
  /** Signed boundary shell volumes, not physical body volumes. Cavities stay negative. */
  shellVolumesMm3: Float64Array;
};
export const PRINT_TOPOLOGY_LIMITS = {
  vertices: 750_000,
  triangles: 250_000,
  samples: 32,
} as const;

/**
 * Deterministic, read-only checks on the exact indexed artifact, independent of
 * the Boolean kernel. No welding, winding repair or face removal is performed.
 * Surface contacts are checked conservatively, including adjacent-face overlaps.
 * Shell nesting and orientation are checked after surface contacts pass.
 */
export function auditPrintTopology(mesh: TopologyMesh): PrintTopologyReport {
  const { V, T } = mesh;
  const checks: PrintTopologyReport['checks'] = {
    buffers: 'not-run',
    faces: 'not-run',
    edges: 'not-run',
    vertexLinks: 'not-run',
    signedVolume: 'not-run',
    nonAdjacentIntersections: 'not-run',
    selfIntersections: 'not-run',
    shellContainment: 'not-run',
    manufacturing: 'not-run',
  };
  let intersections: PrintIntersectionReport | null = null;
  let shellContainment: PrintShellReport | null = null;
  const issues = new Map<
    PrintTopologyIssueCode,
    { count: number; vertices: number[]; triangles: number[] }
  >();
  const add = (
    code: PrintTopologyIssueCode,
    vertices: number[] = [],
    triangles: number[] = [],
    count = 1,
  ) => {
    let issue = issues.get(code);
    if (!issue) {
      issue = { count: 0, vertices: [], triangles: [] };
      issues.set(code, issue);
    }
    issue.count += count;
    for (const vertex of vertices)
      if (issue.vertices.length < PRINT_TOPOLOGY_LIMITS.samples) issue.vertices.push(vertex);
    for (const triangle of triangles)
      if (issue.triangles.length < PRINT_TOPOLOGY_LIMITS.samples) issue.triangles.push(triangle);
  };
  const finish = (
    signedVolumeMm3: number | null = null,
    shellVolumesMm3 = new Float64Array(),
  ): PrintTopologyReport => ({
    status: [...issues.keys()].some((code) => code !== 'unused-vertex')
      ? 'invalid'
      : 'topology-checked',
    checks,
    issues: [...issues].map(([code, issue]) => ({
      code,
      severity: code === 'unused-vertex' ? 'warning' : 'error',
      count: issue.count,
      vertices: Uint32Array.from(issue.vertices),
      triangles: Uint32Array.from(issue.triangles),
    })),
    intersections,
    shellContainment,
    signedVolumeMm3,
    shellVolumesMm3,
  });
  if (
    !Number.isSafeInteger(V.length) ||
    !Number.isSafeInteger(T.length) ||
    V.length <= 0 ||
    T.length <= 0 ||
    V.length % 3 ||
    T.length % 3
  ) {
    add('invalid-buffer');
    checks.buffers = 'failed';
    return finish();
  }
  const vertices = V.length / 3,
    faces = T.length / 3;
  if (vertices > PRINT_TOPOLOGY_LIMITS.vertices || faces > PRINT_TOPOLOGY_LIMITS.triangles) {
    add('budget');
    return finish();
  }
  for (let v = 0; v < vertices; v++) {
    if (![V[v * 3], V[v * 3 + 1], V[v * 3 + 2]].every(Number.isFinite))
      add('non-finite-vertex', [v]);
  }
  for (let f = 0; f < faces; f++) {
    if (
      ![T[f * 3], T[f * 3 + 1], T[f * 3 + 2]].every(
        (v) => Number.isInteger(v) && v >= 0 && v < vertices,
      )
    )
      add('invalid-index', [], [f]);
  }
  checks.buffers = issues.size ? 'failed' : 'passed';
  if (issues.size) return finish();

  const faceKeys = new Set<string>();
  const winding = new Map<number, number>();
  const incidentOffsets = new Uint32Array(vertices + 1);
  for (let f = 0; f < faces; f++) {
    const ids = [T[f * 3], T[f * 3 + 1], T[f * 3 + 2]];
    const [a, b, c] = ids.map((v) => v * 3);
    const ux = V[b] - V[a],
      uy = V[b + 1] - V[a + 1],
      uz = V[b + 2] - V[a + 2];
    const vx = V[c] - V[a],
      vy = V[c + 1] - V[a + 1],
      vz = V[c + 2] - V[a + 2];
    const twiceArea = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (!Number.isFinite(twiceArea)) add('non-finite-face', ids, [f]);
    else if (twiceArea === 0) add('degenerate-face', ids, [f]);
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (faceKeys.has(key)) add('duplicate-face', ids, [f]);
    faceKeys.add(key);
    for (let i = 0; i < 3; i++) {
      const a = ids[i],
        b = ids[(i + 1) % 3];
      incidentOffsets[a + 1]++;
      const key = Math.min(a, b) * vertices + Math.max(a, b);
      winding.set(key, (winding.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  }
  checks.faces = issues.size ? 'failed' : 'passed';
  if (issues.size) return finish();

  // A fresh wrapper prevents an audit of mutable caller buffers from reusing an
  // older drawing topology cache. No derived topology is stored in the report.
  const topology = getMeshTopology({ V, T });
  for (let e = 0; e < topology.edgeFaceCounts.length; e++) {
    const a = topology.edgeVertices[e * 2],
      b = topology.edgeVertices[e * 2 + 1];
    const count = topology.edgeFaceCounts[e];
    if (count === 1) add('boundary-edge', [a, b]);
    else if (count !== 2) add('non-manifold-edge', [a, b]);
    else if (winding.get(a * vertices + b) !== 0) add('inconsistent-winding', [a, b]);
  }
  // Connectivity omits edges at or below 1e-12 mm; reject that unsupported scale.
  if (topology.zeroLengthEdgeCount) {
    add('short-edge', [], [], topology.zeroLengthEdgeCount);
  }
  checks.edges = issues.size ? 'failed' : 'passed';
  for (let i = 1; i <= vertices; i++) incidentOffsets[i] += incidentOffsets[i - 1];
  const cursor = incidentOffsets.slice(),
    incidentFaces = new Uint32Array(T.length);
  for (let f = 0; f < faces; f++)
    for (let i = 0; i < 3; i++) incidentFaces[cursor[T[f * 3 + i]]++] = f;
  for (let v = 0; v < vertices; v++) {
    if (incidentOffsets[v] === incidentOffsets[v + 1]) {
      add('unused-vertex', [v]);
      continue;
    }
    // The link of an interior manifold vertex is exactly one cycle. Two closed
    // fans touching only at that vertex pass edge incidence but fail this test.
    const links = new Map<number, number[]>();
    for (let i = incidentOffsets[v]; i < incidentOffsets[v + 1]; i++) {
      const f = incidentFaces[i];
      const pair = [T[f * 3], T[f * 3 + 1], T[f * 3 + 2]].filter((id) => id !== v);
      const [a, b] = pair;
      if (!links.has(a)) links.set(a, []);
      if (!links.has(b)) links.set(b, []);
      links.get(a)!.push(b);
      links.get(b)!.push(a);
    }
    let valid = [...links.values()].every((neighbors) => neighbors.length === 2);
    if (valid) {
      const stack = [links.keys().next().value!],
        visited = new Set<number>();
      while (stack.length) {
        const next = stack.pop()!;
        if (visited.has(next)) continue;
        visited.add(next);
        for (const neighbor of links.get(next)!) if (!visited.has(neighbor)) stack.push(neighbor);
      }
      valid = visited.size === links.size;
    }
    if (!valid) add('non-manifold-vertex', [v]);
  }
  checks.vertexLinks = issues.has('non-manifold-vertex') ? 'failed' : 'passed';
  if (checks.edges === 'failed' || checks.vertexLinks === 'failed') return finish();

  const volumes = new Float64Array(topology.componentCount),
    compensation = volumes.slice();
  const origins = new Int32Array(topology.componentCount).fill(-1);
  for (let f = 0; f < faces; f++) {
    const ids = [T[f * 3], T[f * 3 + 1], T[f * 3 + 2]];
    const component = topology.componentLabels[ids[0]];
    if (origins[component] === -1) origins[component] = ids[0];
    const origin = origins[component] * 3;
    const [a, b, c] = ids.map((id) => [
      V[id * 3] - V[origin],
      V[id * 3 + 1] - V[origin + 1],
      V[id * 3 + 2] - V[origin + 2],
    ]);
    const volume =
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    const delta = volume - compensation[component],
      next = volumes[component] + delta;
    compensation[component] = next - volumes[component] - delta;
    volumes[component] = next;
  }
  const shells = volumes.filter((_, component) => origins[component] !== -1);
  const total = shells.reduce((sum, volume) => sum + volume, 0);
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    shells.some((volume) => !Number.isFinite(volume) || volume === 0)
  )
    add('non-positive-volume');
  checks.signedVolume = issues.has('non-positive-volume') ? 'failed' : 'passed';
  if (checks.signedVolume === 'passed') {
    intersections = auditSurfaceIntersections(mesh);
    checks.selfIntersections = intersections.status === 'passed' ? 'passed' : 'failed';
    checks.nonAdjacentIntersections =
      intersections.complete && !intersections.nonAdjacentPairCount ? 'passed' : 'failed';
    if (intersections.pairCount)
      add('surface-contact', [], Array.from(intersections.trianglePairs), intersections.pairCount);
    if (!intersections.complete) add('intersection-budget');
  }
  if (intersections?.status === 'passed') {
    shellContainment = auditShellContainment(
      mesh,
      topology.componentLabels,
      volumes,
      intersections.toleranceMm,
    );
    checks.shellContainment = shellContainment.status === 'passed' ? 'passed' : 'failed';
    for (const shell of shellContainment.shells)
      if (shell.orientationMatchesDepth === false)
        add('shell-orientation', [shell.sampleVertex], [shell.sampleTriangle]);
    if (shellContainment.status === 'budget-exceeded') add('shell-budget');
    if (shellContainment.status === 'indeterminate') add('shell-indeterminate');
  }
  return finish(total, shells);
}

export class PrintTopologyError extends Error {
  constructor(
    public readonly report: PrintTopologyReport,
    label: string,
  ) {
    super(
      `${label} failed topology checks: ${report.issues
        .flatMap((issue) => (issue.severity === 'error' ? [`${issue.code} (${issue.count})`] : []))
        .join(', ')}.`,
    );
    this.name = 'PrintTopologyError';
  }
}

export function assertPrintTopology(mesh: TopologyMesh, label: string): PrintTopologyReport {
  const report = auditPrintTopology(mesh);
  if (report.status === 'invalid') throw new PrintTopologyError(report, label);
  return report;
}
