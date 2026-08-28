import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import { createRenderSettingsSnapshot, renderSettingKeys } from './render-settings';

describe('render settings snapshots', () => {
  it('copies every declared worker setting and derives the document title', () => {
    const snapshot = createRenderSettingsSnapshot({ ...contourSettings, name: 'demo · sphere' });

    expect(Object.keys(snapshot).sort()).toEqual([...renderSettingKeys, 'documentTitle'].sort());
    expect(snapshot.documentTitle).toBe('demo · sphere');
    for (const key of renderSettingKeys) expect(snapshot[key]).toEqual(contourSettings[key]);
  });

  it('does not leak runtime state or request-only compatibility fields', () => {
    const source = {
      ...contourSettings,
      name: 'uploaded model',
      mesh: { large: 'runtime-only' },
      svg: '<svg/>',
      previewDetail: 0.5,
      suppressBackground: true,
      lens: 'fisheye',
      lensAmount: 75,
    };
    const snapshot = createRenderSettingsSnapshot(source);

    expect(snapshot).not.toHaveProperty('mesh');
    expect(snapshot).not.toHaveProperty('svg');
    expect(snapshot).not.toHaveProperty('previewDetail');
    expect(snapshot).not.toHaveProperty('suppressBackground');
    expect(snapshot).not.toHaveProperty('lens');
    expect(snapshot).not.toHaveProperty('lensAmount');
  });

  it('detaches mutable morph targets from browser state', () => {
    const source = {
      ...contourSettings,
      name: 'morph study',
      morphTargets: { zoom: 2, axis: 'x' },
      morphTargets2: { roll: 90 },
    };
    const snapshot = createRenderSettingsSnapshot(source);

    snapshot.morphTargets.zoom = 4;
    snapshot.morphTargets2.roll = 180;
    expect(source.morphTargets).toEqual({ zoom: 2, axis: 'x' });
    expect(source.morphTargets2).toEqual({ roll: 90 });
  });
});
