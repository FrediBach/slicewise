import { useEffect, useState } from 'react';
import { DiamondPlus, Pause, Play, SkipBack, Trash2 } from 'lucide-react';

type AnimationUiKeyframe = { id: string; timeMs: number };
type AnimationUiState = {
  mode: 'config' | 'animation';
  durationMs: number;
  fps: number;
  playheadMs: number;
  selectedKeyframeId: string | null;
  playing: boolean;
  keyframes: AnimationUiKeyframe[];
};

const initialState: AnimationUiState = {
  mode: 'config',
  durationMs: 5000,
  fps: 30,
  playheadMs: 0,
  selectedKeyframeId: null,
  playing: false,
  keyframes: [],
};

function useAnimationUiState(): AnimationUiState {
  const [state, setState] = useState(initialState);
  useEffect(() => {
    const update = (event: CustomEvent<AnimationUiState>) => setState(event.detail);
    document.addEventListener('animationstatechange', update);
    document.dispatchEvent(new CustomEvent('animationstaterequest'));
    return () => document.removeEventListener('animationstatechange', update);
  }, []);
  return state;
}

const command = (type: string, detail: Record<string, unknown> = {}) =>
  document.dispatchEvent(new CustomEvent('animationcommand', { detail: { type, ...detail } }));

function numericCommand(type: string, value: string, multiplier = 1): void {
  const numeric = Number(value);
  if (Number.isFinite(numeric))
    command(type, { [type === 'duration' ? 'durationMs' : type]: numeric * multiplier });
}

function formatTime(timeMs: number): string {
  const seconds = Math.max(0, timeMs) / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

export function AnimationModeSwitch() {
  const state = useAnimationUiState();
  return (
    <div className="mode-switch" aria-label="Workspace mode">
      {(['config', 'animation'] as const).map((mode) => (
        <button
          type="button"
          key={mode}
          className={state.mode === mode ? 'is-active' : ''}
          aria-pressed={state.mode === mode}
          onClick={() =>
            document.dispatchEvent(new CustomEvent('animationmodechange', { detail: { mode } }))
          }
        >
          {mode === 'config' ? 'Config' : 'Animation'}
        </button>
      ))}
    </div>
  );
}

export function AnimationTimeline() {
  const state = useAnimationUiState();
  if (state.mode !== 'animation') return null;
  return (
    <section className="animation-timeline" aria-label="Animation timeline">
      <div className="animation-transport">
        <button
          type="button"
          aria-label="Jump to animation start"
          onClick={() => command('seek', { timeMs: 0 })}
        >
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          aria-label={state.playing ? 'Pause animation' : 'Play animation'}
          onClick={() => command('play-toggle')}
        >
          {state.playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span className="animation-timecode">
          {formatTime(state.playheadMs)} <i>/</i> {formatTime(state.durationMs)}
        </span>
        <label>
          Duration
          <input
            type="number"
            min="0.1"
            max="3600"
            step="0.1"
            value={state.durationMs / 1000}
            onChange={(event) => numericCommand('duration', event.target.value, 1000)}
          />
          s
        </label>
        <label>
          FPS
          <input
            type="number"
            min="1"
            max="120"
            step="1"
            value={state.fps}
            onChange={(event) => numericCommand('fps', event.target.value)}
          />
        </label>
        <button type="button" aria-label="Add keyframe" onClick={() => command('add')}>
          <DiamondPlus size={14} /> Add keyframe
        </button>
        <button
          type="button"
          aria-label="Delete selected keyframe"
          disabled={
            !state.selectedKeyframeId || state.keyframes[0]?.id === state.selectedKeyframeId
          }
          onClick={() => command('delete')}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="animation-track">
        <input
          type="range"
          min="0"
          max={state.durationMs}
          step={1000 / state.fps}
          value={state.playheadMs}
          aria-label="Animation playhead"
          onInput={(event) => command('seek', { timeMs: Number(event.currentTarget.value) })}
        />
        <div className="animation-keyframes" aria-label={`${state.keyframes.length} keyframes`}>
          {state.keyframes.map((keyframe) => (
            <button
              type="button"
              key={keyframe.id}
              className={state.selectedKeyframeId === keyframe.id ? 'is-selected' : ''}
              style={{ left: `${(keyframe.timeMs / state.durationMs) * 100}%` }}
              aria-label={`Keyframe at ${formatTime(keyframe.timeMs)}`}
              onClick={() => command('select', { id: keyframe.id })}
            />
          ))}
        </div>
      </div>
      <p className="animation-help">
        Select a keyframe to edit morphable parameters. Between keyframes, controls show calculated
        values and remain read-only.
      </p>
    </section>
  );
}
