import { describe, expect, it } from 'vitest';
import {
  initialPreviewPerformance,
  observePreviewPerformance,
  previewCurveQuality,
  previewDetail,
} from './preview-detail';

describe('adaptive preview detail', () => {
  it('increases detail after sustained fast renders', () => {
    let performance = initialPreviewPerformance();
    for (let sample = 0; sample < 8; sample++)
      performance = observePreviewPerformance(performance, 30);

    expect(previewDetail(performance)).toBe(1);
  });

  it('reduces detail only after sustained slow renders', () => {
    let performance = initialPreviewPerformance();
    for (let sample = 0; sample < 3; sample++)
      performance = observePreviewPerformance(performance, 75);
    expect(previewDetail(performance)).toBe(0.67);

    performance = observePreviewPerformance(performance, 75);
    expect(previewDetail(performance)).toBe(0.5);
  });

  it('reduces curve precision without changing the preview composition', () => {
    expect(previewCurveQuality(9, 1)).toBe(9);
    expect(previewCurveQuality(9, 0.5)).toBe(5);
  });
});
