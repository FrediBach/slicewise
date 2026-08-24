import { describe, expect, it } from 'vitest';
import { isPreviewBusy, previewViewTransform, renderDisposition } from './render-scheduling';

describe('renderDisposition', () => {
  it('commits the result for the latest request', () => {
    expect(
      renderDisposition({ responseId: 7, latestRequestId: 7, sameMesh: true, quick: false }),
    ).toBe('commit');
  });

  it('uses an older quick result only as transient preview feedback', () => {
    expect(
      renderDisposition({ responseId: 6, latestRequestId: 7, sameMesh: true, quick: true }),
    ).toBe('preview');
  });

  it('keeps even the latest quick result out of exact export state', () => {
    expect(
      renderDisposition({ responseId: 7, latestRequestId: 7, sameMesh: true, quick: true }),
    ).toBe('preview');
  });

  it('discards stale final results and results for replaced meshes', () => {
    expect(
      renderDisposition({ responseId: 6, latestRequestId: 7, sameMesh: true, quick: false }),
    ).toBe('discard');
    expect(
      renderDisposition({ responseId: 7, latestRequestId: 7, sameMesh: false, quick: true }),
    ).toBe('discard');
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
