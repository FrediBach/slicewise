export type WorkspaceMode = 'config' | 'animation' | 'sequencer';

export interface SequencerUiStep {
  index: number;
  candidateHit: boolean;
  willFire: boolean;
  value: number;
  label: string;
}

export interface SequencerUiLane {
  id: string;
  name: string;
  kind: 'melodic' | 'drum';
  steps: number;
  pulses: number;
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
  lanes: SequencerUiLane[];
}
