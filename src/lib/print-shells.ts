import type { TopologyMesh } from './mesh-topology';

export const PRINT_SHELL_LIMITS = { shells: 256, triangles: 250_000, work: 5_000_000 } as const;
export const SHELL_WINDING_TOLERANCE = 1e-6;
export type PrintShell = {
  component: number;
  sampleVertex: number;
  sampleTriangle: number;
  signedVolumeMm3: number;
  /** Index in shells, -1 for a root. Null until all containment checks finish. */
  parent: number | null;
  depth: number | null;
  orientationMatchesDepth: boolean | null;
};
export type PrintShellReport = {
  status: 'passed' | 'failed' | 'indeterminate' | 'budget-exceeded';
  complete: boolean;
  work: number;
  windingTolerance: number;
  toleranceMm: number;
  shells: PrintShell[];
  /** Only reported when nesting and orientation both pass. */
  bodyCount: number | null;
  unresolvedPair: [number, number] | null;
};
type Group = { report: PrintShell; faces: number[]; bounds: number[] };
type Vec = [number, number, number];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Requires closed, consistently wound, nonintersecting manifold shells: the
 * parent auditor must complete those checks first. A shell vertex is off
 * every other boundary and classifies its connected shell as a whole. Triangle
 * solid angles use normalized rays and compensated summation; see
 * https://igl.ethz.ch/projects/winding-number/. No orientation repair occurs.
 */
export function auditShellContainment(
  mesh: TopologyMesh,
  componentLabels: ArrayLike<number>,
  componentVolumes: ArrayLike<number>,
  toleranceMm: number,
  workLimit: number = PRINT_SHELL_LIMITS.work,
): PrintShellReport {
  if (!Number.isSafeInteger(workLimit) || workLimit < 0 || workLimit > PRINT_SHELL_LIMITS.work)
    throw new Error('Shell work limit must be an integer within the supported budget.');
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0)
    throw new Error('Shell coordinate tolerance must be finite and nonnegative.');
  const { V, T } = mesh;
  const byComponent = new Map<number, Group>();
  const groups: Group[] = [];
  let work = 0;
  const finish = (
    status: PrintShellReport['status'],
    unresolvedPair: [number, number] | null = null,
  ): PrintShellReport => ({
    status,
    complete: status === 'passed' || status === 'failed',
    work,
    windingTolerance: SHELL_WINDING_TOLERANCE,
    toleranceMm,
    shells: groups.map((group) => ({ ...group.report })),
    bodyCount:
      status === 'passed'
        ? groups.reduce((sum, g) => sum + (g.report.depth! % 2 === 0 ? 1 : 0), 0)
        : null,
    unresolvedPair,
  });
  if (T.length / 3 > PRINT_SHELL_LIMITS.triangles) return finish('budget-exceeded');
  for (let f = 0; f < T.length / 3; f++) {
    const vertex = T[f * 3],
      component = componentLabels[vertex];
    let group = byComponent.get(component);
    if (!group) {
      if (byComponent.size >= PRINT_SHELL_LIMITS.shells) return finish('budget-exceeded');
      group = {
        report: {
          component,
          sampleVertex: vertex,
          sampleTriangle: f,
          signedVolumeMm3: componentVolumes[component],
          parent: null,
          depth: null,
          orientationMatchesDepth: null,
        },
        faces: [],
        bounds: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
      };
      byComponent.set(component, group);
      groups.push(group);
    }
    group.faces.push(f);
    for (let corner = 0; corner < 3; corner++)
      for (let axis = 0; axis < 3; axis++) {
        const value = V[T[f * 3 + corner] * 3 + axis];
        group.bounds[axis] = Math.min(group.bounds[axis], value);
        group.bounds[axis + 3] = Math.max(group.bounds[axis + 3], value);
      }
  }
  groups.sort((a, b) => a.report.component - b.report.component);
  const containers = groups.map(() => new Set<number>());
  for (let child = 0; child < groups.length; child++) {
    const sample = groups[child].report.sampleVertex * 3;
    for (let candidate = 0; candidate < groups.length; candidate++) {
      if (candidate === child) continue;
      if (work >= workLimit) return finish('budget-exceeded', [child, candidate]);
      work++;
      const outer = groups[candidate].bounds,
        inner = groups[child].bounds;
      // A containing shell must contain the full child's bounds. This is a
      // rejection shortcut only; nested AABBs alone never establish containment.
      if (
        [0, 1, 2].some(
          (a) => inner[a] < outer[a] - toleranceMm || inner[a + 3] > outer[a + 3] + toleranceMm,
        )
      )
        continue;
      let sum = 0,
        compensation = 0;
      for (const face of groups[candidate].faces) {
        if (work >= workLimit) return finish('budget-exceeded', [child, candidate]);
        work++;
        const rays: Vec[] = [];
        for (let corner = 0; corner < 3; corner++) {
          const offset = T[face * 3 + corner] * 3;
          const ray: Vec = [
            V[offset] - V[sample],
            V[offset + 1] - V[sample + 1],
            V[offset + 2] - V[sample + 2],
          ];
          const length = Math.hypot(...ray);
          if (!Number.isFinite(length) || length <= toleranceMm)
            return finish('indeterminate', [child, candidate]);
          rays.push(ray.map((v) => v / length) as Vec);
        }
        const [a, b, c] = rays;
        const numerator =
          a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0]);
        const denominator = 1 + dot(a, b) + dot(b, c) + dot(c, a);
        if (Math.abs(numerator) + Math.abs(denominator) < 64 * Number.EPSILON)
          return finish('indeterminate', [child, candidate]);
        const angle = 2 * Math.atan2(numerator, denominator);
        const delta = angle - compensation,
          next = sum + delta;
        compensation = next - sum - delta;
        sum = next;
      }
      const winding = Math.abs(sum / (4 * Math.PI));
      if (Math.abs(winding - 1) <= SHELL_WINDING_TOLERANCE) containers[child].add(candidate);
      else if (!Number.isFinite(winding) || winding > SHELL_WINDING_TOLERANCE)
        return finish('indeterminate', [child, candidate]);
    }
  }
  // A valid disjoint-shell containment relation forms a forest. Require each
  // child's containers to be precisely its parent's containers plus the parent.
  const parents = groups.map(() => -1);
  for (let child = 0; child < groups.length; child++) {
    const ancestors = containers[child];
    if (!ancestors.size) continue;
    const candidates = [...ancestors].filter(
      (candidate) =>
        containers[candidate].size === ancestors.size - 1 &&
        [...ancestors].every((a) => a === candidate || containers[candidate].has(a)),
    );
    if (candidates.length !== 1) return finish('indeterminate');
    parents[child] = candidates[0];
  }
  for (let i = 0; i < groups.length; i++) {
    const report = groups[i].report;
    report.parent = parents[i];
    report.depth = containers[i].size;
    report.orientationMatchesDepth =
      report.depth % 2 === 0 ? report.signedVolumeMm3 > 0 : report.signedVolumeMm3 < 0;
  }
  return finish(groups.every((g) => g.report.orientationMatchesDepth) ? 'passed' : 'failed');
}
