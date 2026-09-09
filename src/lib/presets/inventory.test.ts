import { expect, it } from 'vitest';
import { renderSettingKeys } from '../render-settings';
import { proceduralSettingKeys } from '../procedural-source';
import { appStatePresetOwnership } from './inventory';

it('assigns all worker settings to a preset owner, keeping procedural bases in source', () => {
  for (const key of renderSettingKeys)
    expect(['drawing', 'source']).toContain(appStatePresetOwnership[key]);
  for (const key of proceduralSettingKeys) expect(appStatePresetOwnership[key]).toBe('source');
  expect(appStatePresetOwnership.tilingP).toBe('source');
  expect(appStatePresetOwnership.morphTargets).toBe('drawing');
  expect(appStatePresetOwnership.gradientStops).toBe('drawing');
});

it('distinguishes export settings and original artwork from generated outputs', () => {
  expect(appStatePresetOwnership.uunaExpressiveMotion).toBe('export');
  expect(appStatePresetOwnership.svgSource).toBe('asset');
  for (const key of ['mesh', 'svg', 'toolpaths', 'sequenceSource'] as const)
    expect(appStatePresetOwnership[key]).toBe('transient');
  expect(appStatePresetOwnership.lens).toBe('legacy');
});
