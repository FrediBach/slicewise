import { describe, expect, it } from 'vitest';
import {
  initialPreviewPerformance,
  observePreviewPerformance,
  previewCurveQuality,
  previewDetail,
  previewLineCount,
  previewMorphSteps,
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

  it('adapts contour density, curve precision, and morph instances', () => {
    expect(previewLineCount(80, 1)).toBe(80);
    expect(previewLineCount(80, 0.5)).toBe(40);
    expect(previewCurveQuality(9, 1)).toBe(9);
    expect(previewCurveQuality(9, 0.5)).toBe(5);
    expect(previewMorphSteps(24, 1)).toBe(5);
    expect(previewMorphSteps(24, 0.5)).toBe(3);
  });
});
