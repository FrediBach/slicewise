export type WorkspaceMode = 'config' | 'animation' | 'sequencer';

export interface SequencerUiStep {
  index: number;
  candidateHit: boolean;
  willFire: boolean;
  expressive: boolean;
  value: number;
  label: string;
}

export interface SequencerUiLane {
  id: string;
  name: string;
  kind: 'melodic' | 'drum';
  preset: string;
  variationTarget: 'off' | 'accent' | 'octave' | 'articulation' | 'ratchet';
  steps: number;
  pulses: number;
  clockDivision: '1/4' | '1/8' | '1/16' | '1/32' | 'fit-1' | 'fit-2' | 'fit-4';
  direction: 'forward' | 'reverse' | 'ping-pong';
  traversalStart: number;
  traversalEnd: number;
  trackPosition: number;
  modulationSource: string;
  modulationAmount: number;
  contourInfluence: number;
  muted: boolean;
  solo: boolean;
  activeStep: number;
  sequence: SequencerUiStep[];
}

export interface SequencerUiState {
  mode: WorkspaceMode;
  playing: boolean;
  playheadTick: number;
  bar: number;
  beat: number;
  tempo: number;
  pendingShape: boolean;
  hasExactSource: boolean;
  canExport: boolean;
  exportBars: number;
  lanes: SequencerUiLane[];
}
