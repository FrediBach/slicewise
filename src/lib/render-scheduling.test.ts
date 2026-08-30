import { describe, expect, it } from 'vitest';
import { contourSettings } from '../test/fixtures/contours';
import {
  coalesceRenderQuality,
  createExplicitRenderSnapshot,
  isConfigExportCurrent,
  isPreviewBusy,
  previewViewTransform,
  renderDisposition,
  type RenderPurpose,
  type RenderQuality,
} from './render-scheduling';

const disposition = (
  responseId: number,
  latestRequestId: number,
  quality: RenderQuality,
  responsePurpose: RenderPurpose = 'config',
  latestPurpose: RenderPurpose = responsePurpose,
  extra: { sameMesh?: boolean; allowStaleQuickPreview?: boolean } = {},
) =>
  renderDisposition({
    responseId,
    latestRequestId,
    quality,
    responsePurpose,
    latestPurpose,
    sameMesh: extra.sameMesh ?? true,
    allowStaleQuickPreview: extra.allowStaleQuickPreview,
  });

describe('explicit render snapshots', () => {
  it('detaches settings and adds quick-preview detail', () => {
    const source = {
      ...contourSettings,
      morphTargets: { zoom: 2 },
      morphTargets2: { roll: 90 },
    };
    const request = createExplicitRenderSnapshot(
      {
        settings: source,
        quality: 'quick',
        history: 'record',
        purpose: 'config',
      },
      0.5,
    );

    expect(request.settings.previewDetail).toBe(0.5);
    expect(request.settings.morphTargets).toEqual({ zoom: 2 });
    request.settings.morphTargets.zoom = 3;
    expect(source.morphTargets).toEqual({ zoom: 2 });
  });

  it.each(['animation-preview', 'animation-export'] as const)(
    'forces Morph and Config history off for %s renders',
    (purpose) => {
      const request = createExplicitRenderSnapshot({
        settings: {
          ...contourSettings,
          morphEnabled: true,
          morphSecondEnabled: true,
          morphTargets: { zoom: 2 },
          morphTargets2: { roll: 90 },
        },
        quality: 'exact',
        history: 'record',
        purpose,
      });

      expect(request.history).toBe('ignore');
      expect(request.settings).toMatchObject({
        morphEnabled: false,
        morphSecondEnabled: false,
        morphTargets: {},
        morphTargets2: {},
      });
    },
  );

  it('forces animation export to exact quality', () => {
    const request = createExplicitRenderSnapshot(
      {
        settings: contourSettings,
        quality: 'quick',
        history: 'record',
        purpose: 'animation-export',
      },
      0.25,
    );

    expect(request.quality).toBe('exact');
    expect(request.settings).not.toHaveProperty('previewDetail');
  });

  it('only carries queued exact quality forward within the same purpose', () => {
    expect(coalesceRenderQuality('quick', 'config', { quality: 'exact', purpose: 'config' })).toBe(
      'exact',
    );
    expect(
      coalesceRenderQuality('quick', 'animation-preview', {
        quality: 'exact',
        purpose: 'config',
      }),
    ).toBe('quick');
    expect(coalesceRenderQuality('exact', 'config', null)).toBe('exact');
  });
});

describe('renderDisposition', () => {
  it('commits only the latest exact Config result', () => {
    expect(disposition(7, 7, 'exact')).toBe('commit');
    expect(disposition(7, 7, 'exact', 'animation-preview')).toBe('preview');
    expect(disposition(7, 7, 'exact', 'animation-export')).toBe('capture');
    expect(disposition(7, 7, 'quick', 'animation-export')).toBe('discard');
  });

  it('discards an older quick result instead of flashing a stale design', () => {
    expect(disposition(6, 7, 'quick')).toBe('discard');
  });

  it('uses an older quick result as transient feedback during direct manipulation', () => {
    expect(disposition(6, 7, 'quick', 'config', 'config', { allowStaleQuickPreview: true })).toBe(
      'preview',
    );
    expect(
      disposition(6, 7, 'quick', 'animation-preview', 'animation-preview', {
        allowStaleQuickPreview: true,
      }),
    ).toBe('discard');
  });

  it('keeps even the latest quick result out of exact export state', () => {
    expect(disposition(7, 7, 'quick')).toBe('preview');
  });

  it('discards stale results, replaced meshes, and superseded purposes', () => {
    expect(disposition(6, 7, 'exact', 'config', 'config', { allowStaleQuickPreview: true })).toBe(
      'discard',
    );
    expect(disposition(7, 7, 'quick', 'config', 'config', { sameMesh: false })).toBe('discard');
    expect(disposition(7, 7, 'exact', 'animation-preview', 'config')).toBe('discard');
  });
});

describe('Config export freshness', () => {
  it('is independent of animation request ids', () => {
    expect(isConfigExportCurrent(4, 4)).toBe(true);
    expect(isConfigExportCurrent(4, 5)).toBe(false);
    expect(isConfigExportCurrent(0, 0)).toBe(false);
  });
});

describe('previewViewTransform', () => {
  it('keeps zoom centred on the model origin and includes pan changes', () => {
    expect(
      previewViewTransform(
        { zoom: 1, panX: 0, panY: 0 },
        { zoom: 2, panX: 10, panY: -5 },
        200,
        100,
      ),
    ).toEqual([2, -90, -55]);
  });

  it('returns the identity transform for an already current preview', () => {
    expect(
      previewViewTransform(
        { zoom: 1.5, panX: 12, panY: -4 },
        { zoom: 1.5, panX: 12, panY: -4 },
        210,
        297,
      ),
    ).toEqual([1, 0, 0]);
  });
});

describe('isPreviewBusy', () => {
  it('stays busy for queued and in-flight contour or mesh work', () => {
    const idle = {
      renderInFlight: false,
      renderQueued: false,
      generationInFlight: false,
      generationQueued: false,
    };

    expect(isPreviewBusy(idle)).toBe(false);
    for (const key of Object.keys(idle) as Array<keyof typeof idle>) {
      expect(isPreviewBusy({ ...idle, [key]: true })).toBe(true);
    }
  });
});
