// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppearancePanel, CanvasPanel, EffectsPanel, ExportPanel } from './OutputPanel';

describe('OutputPanel line-weight controls', () => {
  it('exposes randomization locks and numeric morph controls', () => {
    render(<AppearancePanel />);

    expect(
      screen.getByRole('button', { name: 'Lock Line-weight variation randomization' }),
    ).toBeInTheDocument();
    for (const label of ['Interval', 'Variation']) {
      expect(
        screen.getByRole('button', { name: `Lock ${label} randomization` }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `${label} morph mode: none` })).toBeInTheDocument();
    }
  });
});

describe('OutputPanel yarn controls', () => {
  it('exposes randomizable percentage and curl-size controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Yarn cut & curl' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Lines to cut in %' })).toHaveAttribute(
      'max',
      '500',
    );
    expect(screen.getByRole('spinbutton', { name: 'Curl size in %' })).toHaveValue(100);
    expect(
      screen.getByRole('button', { name: 'Lock Lines to cut randomization' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lock Curl size randomization' }),
    ).toBeInTheDocument();
  });
});

describe('OutputPanel explode control', () => {
  it('exposes a morphable slice explosion slider', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('spinbutton', { name: 'Slice explode in %' })).toHaveValue(0);
    expect(
      screen.getByRole('button', { name: 'Slice explode morph mode: none' }),
    ).toBeInTheDocument();
  });
});

describe('OutputPanel kaleidoscope controls', () => {
  it('exposes plotter-safe segment and rotation controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Kaleidoscope' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Segments' })).toHaveValue(6);
    expect(screen.getByRole('spinbutton', { name: 'Rotation in °' })).toHaveValue(0);
  });
});

describe('OutputPanel composition boundaries', () => {
  it('keeps all generated vector-zoom slots mounted with unique runtime IDs', () => {
    render(<EffectsPanel />);

    for (let index = 1; index <= 4; index++) {
      expect(screen.getByRole('checkbox', { name: `Enable zoom ${index}` })).not.toBeChecked();
      expect(document.getElementById(`vectorZoom${index}Controls`)).toBeInTheDocument();
      expect(screen.getAllByLabelText('Inset corner')[index - 1]).toBeDisabled();
    }
  });

  it('preserves the canvas and export controls through the panel barrel', () => {
    const { unmount } = render(<CanvasPanel />);
    expect(screen.getByLabelText('Paper size')).toHaveValue('custom');
    expect(screen.getByLabelText('Artboard width')).toHaveValue(210);
    expect(screen.getByLabelText('Clip paths to artboard')).toBeChecked();

    unmount();
    render(<ExportPanel />);
    expect(screen.getByLabelText('File type')).toHaveValue('svg');
    expect(screen.getByLabelText('Machine')).toHaveValue('uunatek3');
    expect(document.getElementById('gcodeControls')).toBeInTheDocument();
  });
});
