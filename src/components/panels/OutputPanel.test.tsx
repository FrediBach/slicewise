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

describe('OutputPanel block-glitch controls', () => {
  it('exposes deterministic plotter-safe block controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Block glitch' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Blocks' })).toHaveValue(3);
    expect(screen.getByRole('spinbutton', { name: 'Block width in %' })).toHaveValue(18);
    expect(screen.getByRole('spinbutton', { name: 'Block height in %' })).toHaveValue(6);
    expect(screen.getByRole('spinbutton', { name: 'Displacement in mm' })).toHaveValue(8);
    expect(screen.getByLabelText('Direction')).toHaveValue('horizontal');
    expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(1);
    expect(screen.getByRole('checkbox', { name: 'Clear destination' })).not.toBeChecked();
  });
});

describe('OutputPanel scan-band controls', () => {
  it('exposes deterministic plotter-safe band controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Scan-band glitch' })).not.toBeChecked();
    expect(screen.getByLabelText('Band orientation')).toHaveValue('horizontal');
    expect(screen.getByRole('spinbutton', { name: 'Bands' })).toHaveValue(12);
    expect(screen.getByRole('spinbutton', { name: 'Band thickness in %' })).toHaveValue(55);
    expect(screen.getByRole('spinbutton', { name: 'Affected bands in %' })).toHaveValue(50);
    expect(screen.getByRole('spinbutton', { name: 'Band displacement in mm' })).toHaveValue(6);
    expect(screen.getByRole('spinbutton', { name: 'Band seed' })).toHaveValue(2);
  });
});

describe('OutputPanel staggered-slice controls', () => {
  it('exposes structured plotter-safe slice controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Staggered slices' })).not.toBeChecked();
    expect(screen.getByLabelText('Slice orientation')).toHaveValue('horizontal');
    expect(screen.getByLabelText('Stagger pattern')).toHaveValue('ramp');
    expect(screen.getByRole('spinbutton', { name: 'Slices' })).toHaveValue(12);
    expect(screen.getByRole('spinbutton', { name: 'Region extent in %' })).toHaveValue(70);
    expect(screen.getByRole('spinbutton', { name: 'Maximum stagger in mm' })).toHaveValue(10);
    expect(screen.getByRole('spinbutton', { name: 'Stagger seed' })).toHaveValue(3);
  });
});

describe('OutputPanel wraparound-tear controls', () => {
  it('exposes full-span band and signed-shift controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Wraparound tear' })).not.toBeChecked();
    expect(screen.getByLabelText('Tear orientation')).toHaveValue('horizontal');
    expect(screen.getByRole('spinbutton', { name: 'Band position in %' })).toHaveValue(50);
    expect(screen.getByRole('spinbutton', { name: 'Band size in %' })).toHaveValue(18);
    expect(screen.getByRole('spinbutton', { name: 'Wrap shift in mm' })).toHaveValue(20);
  });
});

describe('OutputPanel tile-shuffle controls', () => {
  it('exposes deterministic grid permutation controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Tile shuffle' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Tile rows' })).toHaveValue(4);
    expect(screen.getByRole('spinbutton', { name: 'Tile columns' })).toHaveValue(4);
    expect(screen.getByRole('spinbutton', { name: 'Shuffle region extent in %' })).toHaveValue(80);
    expect(screen.getByRole('spinbutton', { name: 'Affected tiles in %' })).toHaveValue(50);
    expect(screen.getByRole('spinbutton', { name: 'Shuffle seed' })).toHaveValue(4);
  });
});

describe('OutputPanel sample-and-hold controls', () => {
  it('exposes plotter-safe resampling and coordinate-hold controls', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Sample-and-hold' })).not.toBeChecked();
    expect(screen.getByLabelText('Hold axis')).toHaveValue('y');
    expect(screen.getByRole('spinbutton', { name: 'Sample spacing in mm' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'Hold length in samples' })).toHaveValue(4);
    expect(screen.getByRole('spinbutton', { name: 'Hold mix in %' })).toHaveValue(100);
  });
});

describe('OutputPanel misregistration controls', () => {
  it('exposes physical copy transforms, scope, and pen colours', () => {
    render(<EffectsPanel />);

    expect(screen.getByRole('checkbox', { name: 'Misregistration' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Registration copies' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'Registration offset in mm' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'Registration rotation in °' })).toHaveValue(0.5);
    expect(screen.getByLabelText('Copy scope')).toHaveValue('contours');
    expect(screen.getByLabelText('Copy 1 colour')).toHaveValue('#00a7e1');
    expect(screen.getByLabelText('Copy 2 colour')).toHaveValue('#ec008c');
    expect(screen.getByLabelText('Copy 3 colour')).toHaveValue('#ffd400');
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
