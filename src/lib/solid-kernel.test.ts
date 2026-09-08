import { beforeAll, describe, expect, it } from 'vitest';
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { createSolidKernel, SOLID_KERNEL_LIMITS, type SolidMesh } from './solid-kernel';
import { createFeasibilityFixtures } from './three-d-feasibility';
import { getMeshTopology } from './mesh-topology';
import { PrintTopologyError } from './print-validation';
import { foldedOctahedron } from '../test/fixtures/solid';

let module: ManifoldToplevel;
let fixtures: ReturnType<typeof createFeasibilityFixtures>;
beforeAll(async () => {
  module = await Module();
  module.setup();
  fixtures = createFeasibilityFixtures(module);
});

// Independent measurement of the returned buffers; no kernel measurement calls.
function signedVolume(mesh: SolidMesh) {
  let volume = 0;
  for (let i = 0; i < mesh.T.length; i += 3) {
    const a = mesh.T[i] * 3,
      b = mesh.T[i + 1] * 3,
      c = mesh.T[i + 2] * 3;
    const v = mesh.V;
    volume +=
      (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) +
        v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) +
        v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) /
      6;
  }
  return volume;
}

function expectClosedOriented(mesh: SolidMesh) {
  const topology = getMeshTopology(mesh);
  expect(topology.boundaryEdges).toHaveLength(0);
  expect(topology.nonManifoldEdges).toHaveLength(0);
  const directions = new Map<string, number>();
  for (let i = 0; i < mesh.T.length; i += 3) {
    for (let edge = 0; edge < 3; edge++) {
      const a = mesh.T[i + edge],
        b = mesh.T[i + ((edge + 1) % 3)];
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      directions.set(key, (directions.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  }
  expect([...directions.values()].every((value) => value === 0)).toBe(true);
  expect(mesh.V.every(Number.isFinite)).toBe(true);
}

describe('phase-0 solid kernel', () => {
  it.each(['sphere', 'box', 'sheared-box'])(
    'removes grooves and fuses ribs on %s without mutating inputs',
    (name) => {
      const fixture = fixtures.find((item) => item.name === name)!;
      const original = structuredClone(fixture);
      const kernel = createSolidKernel(module);
      const baseVolume = signedVolume(fixture.base);
      for (const operation of ['inset', 'emboss'] as const) {
        const result = kernel.run(fixture.base, fixture.tools, operation);
        expectClosedOriented(result.mesh);
        const volume = signedVolume(result.mesh);
        expect(volume).toBeCloseTo(result.measurements.volumeMm3, 3);
        if (operation === 'inset') expect(volume).toBeLessThan(baseVolume);
        else expect(volume).toBeGreaterThan(baseVolume);
        expect(result.measurements.boundaryComponents).toBe(1);
        expect(kernel.liveHandles).toBe(0);
        expect(kernel.run(fixture.base, fixture.tools, operation)).toEqual(result);
      }
      expect(fixture).toEqual(original);
    },
  );

  it('preserves exact neutral buffers and physical asymmetric bounds', () => {
    const fixture = fixtures[1];
    const kernel = createSolidKernel(module);
    for (const operation of ['off', 'inset', 'emboss'] as const) {
      const result = kernel.run(fixture.base, operation === 'off' ? fixture.tools : [], operation);
      expect(result.mesh).toBe(fixture.base);
      expect(result.measurements.bounds).toEqual({ min: [-20, -15, -25], max: [20, 15, 25] });
      expect(result.measurements.volumeMm3).toBeCloseTo(60_000, 5);
      expect(kernel.liveHandles).toBe(0);
    }
  });

  it.each(['inset', 'emboss'] as const)(
    'rejects zero-area faces in the analytic torus %s artifact',
    (operation) => {
      const fixture = fixtures[2];
      const kernel = createSolidKernel(module);
      expect(kernel.run(fixture.base, [], 'off').topology.status).toBe('topology-checked');
      let failure: unknown;
      try {
        kernel.run(fixture.base, fixture.tools, operation);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(PrintTopologyError);
      const report = (failure as PrintTopologyError).report;
      expect(
        report.issues.find((issue) => issue.code === 'degenerate-face')!.count,
      ).toBeGreaterThan(0);
      expect(report.checks.faces).toBe('failed');
      expect(kernel.liveHandles).toBe(0);
    },
  );

  it('unions overlapping tools instead of applying the same groove twice', () => {
    const fixture = fixtures[0];
    const kernel = createSolidKernel(module);
    const single = kernel.run(fixture.base, fixture.tools, 'inset');
    const duplicate = kernel.run(fixture.base, [...fixture.tools, ...fixture.tools], 'inset');
    expect(duplicate.measurements.volumeMm3).toBeCloseTo(single.measurements.volumeMm3, 5);
    expectClosedOriented(duplicate.mesh);
    expect(kernel.liveHandles).toBe(0);
  });

  it('measures groove penetration and rib height away from the box corners', () => {
    const fixture = fixtures[1];
    const kernel = createSolidKernel(module);
    for (const operation of ['inset', 'emboss'] as const) {
      const { mesh } = kernel.run(fixture.base, fixture.tools, operation);
      const equator = [];
      for (let i = 0; i < mesh.V.length; i += 3) {
        if (mesh.V[i] > 0 && Math.abs(mesh.V[i + 1]) <= 15 && Math.abs(mesh.V[i + 2]) < 1e-5)
          equator.push(mesh.V[i]);
      }
      expect(equator.length).toBeGreaterThan(0);
      expect(operation === 'inset' ? Math.min(...equator) : Math.max(...equator)).toBeCloseTo(
        operation === 'inset' ? 19.4 : 20.6,
        4,
      );
    }
  });

  it('reports disconnected bodies without deleting them', () => {
    const base = fixtures[1].base;
    const detached = {
      V: Float32Array.from(base.V, (value, i) => value + (i % 3 === 0 ? 100 : 0)),
      T: base.T,
    };
    const kernel = createSolidKernel(module);
    const result = kernel.run(base, [detached], 'emboss');
    expect(result.measurements.boundaryComponents).toBe(2);
    expect(result.measurements.volumeMm3).toBeCloseTo(120_000, 4);
    expectClosedOriented(result.mesh);
    expect(kernel.liveHandles).toBe(0);
  });

  it('releases imported and intermediate solids after invalid tools and empty results', () => {
    const fixture = fixtures[1];
    const kernel = createSolidKernel(module);
    const open = { V: fixture.base.V, T: fixture.base.T.slice(3) };
    expect(() => kernel.run(open, [], 'off')).toThrow();
    expect(kernel.liveHandles).toBe(0);
    expect(() => kernel.run(fixture.base, [fixture.tools[0], open], 'inset')).toThrow();
    expect(kernel.liveHandles).toBe(0);
    expect(() => kernel.run(fixture.base, [fixture.base], 'inset')).toThrow(/entire object/);
    expect(kernel.liveHandles).toBe(0);
    expect(kernel.run(fixture.base, fixture.tools, 'emboss').measurements.boundaryComponents).toBe(
      1,
    );
    expect(kernel.liveHandles).toBe(0);
  });

  it('rejects malformed buffers, nonfinite positions, invalid indices and budget overruns', () => {
    const base = fixtures[1].base;
    const kernel = createSolidKernel(module);
    for (const invalid of [
      { ...base, V: new Float32Array([0, 1]) },
      { ...base, V: Float32Array.from(base.V, (_, i) => (i === 0 ? NaN : 0)) },
      { ...base, T: new Uint32Array([0, 1, 1_000_000]) },
      { ...base, T: new Uint32Array((SOLID_KERNEL_LIMITS.triangles + 1) * 3) },
    ])
      expect(() => kernel.run(invalid, [], 'off')).toThrow();
    expect(() => kernel.run(base, Array(65).fill(base), 'inset')).toThrow(/tool budget/);
    expect(kernel.liveHandles).toBe(0);
  });

  it('releases handles across repeated successful preparations', () => {
    const fixture = fixtures[1];
    const kernel = createSolidKernel(module);
    for (let i = 0; i < 20; i++) {
      kernel.run(fixture.base, fixture.tools, i % 2 ? 'inset' : 'emboss');
      expect(kernel.liveHandles).toBe(0);
    }
  });

  it('preserves an enclosed cavity and counts boundary shells without calling them bodies', () => {
    const base = fixtures[1].base;
    const cavity = { V: Float32Array.from(base.V, (value) => value / 2), T: base.T };
    const kernel = createSolidKernel(module);
    const result = kernel.run(base, [cavity], 'inset');
    expectClosedOriented(result.mesh);
    expect(result.measurements.volumeMm3).toBeCloseTo(52_500, 5);
    expect(signedVolume(result.mesh)).toBeCloseTo(52_500, 5);
    expect(result.measurements.boundaryComponents).toBe(2);
    expect(getMeshTopology(result.mesh).componentSizes).toHaveLength(2);
    expect(kernel.liveHandles).toBe(0);
  });

  it('rejects a degenerate source before import can silently discard its face, including Off', () => {
    const base = fixtures[1].base;
    const invalid = { V: base.V, T: new Uint32Array([...base.T, 0, 0, 0]) };
    const native = new module.Manifold(
      new module.Mesh({ numProp: 3, vertProperties: invalid.V, triVerts: invalid.T }),
    );
    try {
      expect(native.status()).toBe('NoError');
      expect(native.numTri()).toBe(base.T.length / 3);
    } finally {
      native.delete();
    }
    const kernel = createSolidKernel(module);
    for (const operation of ['off', 'inset', 'emboss'] as const) {
      expect(() => kernel.run(invalid, fixtures[1].tools, operation)).toThrow(PrintTopologyError);
      expect(kernel.liveHandles).toBe(0);
    }
    expect(invalid.T.length).toBe(base.T.length + 3);
  });

  it('rejects contacting shells in sources and tools before native Boolean evaluation', () => {
    const base = fixtures[1].base;
    const overlap = {
      V: Float32Array.from([
        ...base.V,
        ...Array.from(base.V, (v, i) => v + (i % 3 === 0 ? 10 : 0)),
      ]),
      T: Uint32Array.from([...base.T, ...Array.from(base.T, (v) => v + base.V.length / 3)]),
    };
    const original = structuredClone(overlap);
    const kernel = createSolidKernel(module);
    for (const operation of ['off', 'inset', 'emboss'] as const) {
      expect(() => kernel.run(overlap, [], operation)).toThrow(/Source.*surface-contact/);
      expect(kernel.liveHandles).toBe(0);
    }
    expect(() => kernel.run(base, [overlap], 'emboss')).toThrow(/Tool 1.*surface-contact/);
    expect(kernel.liveHandles).toBe(0);
    expect(overlap).toEqual(original);
    expect(kernel.run(base, [], 'off').topology.checks.nonAdjacentIntersections).toBe('passed');
  });

  it('blocks a folded manifold source or tool while retaining adjacent-pair diagnostics', () => {
    const mesh = foldedOctahedron(),
      original = structuredClone(mesh);
    const kernel = createSolidKernel(module);
    for (const operation of ['off', 'inset', 'emboss'] as const) {
      let failure: unknown;
      try {
        kernel.run(mesh, [], operation);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(PrintTopologyError);
      expect(
        (failure as PrintTopologyError).report.intersections?.adjacentPairCount,
      ).toBeGreaterThan(0);
      expect(kernel.liveHandles).toBe(0);
    }
    expect(() => kernel.run(fixtures[1].base, [mesh], 'inset')).toThrow(/Tool 1.*surface-contact/);
    expect(kernel.liveHandles).toBe(0);
    expect(mesh).toEqual(original);
  });

  it('returns explicit unperformed checks and warnings on exact neutral buffers', () => {
    const base = fixtures[1].base;
    const source = { V: new Float32Array([...base.V, 100, 100, 100]), T: base.T };
    const result = createSolidKernel(module).run(source, [], 'off');
    expect(result.mesh).toBe(source);
    expect(result.topology.status).toBe('topology-checked');
    expect(result.topology.checks.shellContainment).toBe('not-run');
    expect(result.topology.checks.selfIntersections).toBe('passed');
    expect(result.topology.issues[0].code).toBe('unused-vertex');
    expect(result.topology.issues[0].severity).toBe('warning');
    const treated = createSolidKernel(module).run(source, fixtures[1].tools, 'emboss');
    expect(treated.inputTopology.source.issues[0].code).toBe('unused-vertex');
    expect(source.V.length).toBe(base.V.length + 3);
  });
});
