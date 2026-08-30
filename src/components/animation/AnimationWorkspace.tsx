import { useEffect, useRef, useState } from 'react';
import {
  CopyPlus,
  DiamondPlus,
  Download,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { type AnimationEasing } from '../../lib/animation-project';

type AnimationUiKeyframe = {
  id: string;
  timeMs: number;
  easingToNext: AnimationEasing;
};
type AnimationUiState = {
  mode: 'config' | 'animation';
  durationMs: number;
  fps: number;
  loopPreview: boolean;
  playheadMs: number;
  selectedKeyframeId: string | null;
  playing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  keyframes: AnimationUiKeyframe[];
};

const initialState: AnimationUiState = {
  mode: 'config',
  durationMs: 5000,
  fps: 30,
  loopPreview: true,
  playheadMs: 0,
  selectedKeyframeId: null,
  playing: false,
  canUndo: false,
  canRedo: false,
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

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
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
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<string | null>(null);
  const selected = state.keyframes.find(({ id }) => id === state.selectedKeyframeId);
  const selectedIndex = selected ? state.keyframes.indexOf(selected) : -1;
  const selectedIsProtected = selected?.timeMs === 0;
  const selectedHasOutgoingSegment =
    selectedIndex >= 0 && selectedIndex < state.keyframes.length - 1;

  useEffect(() => {
    if (state.mode !== 'animation') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      let handled = true;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')
        command(event.shiftKey ? 'redo' : 'undo');
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') command('redo');
      else if (event.code === 'Space') command('play-toggle');
      else if (event.key === 'ArrowLeft') command('step', { frames: event.shiftKey ? -10 : -1 });
      else if (event.key === 'ArrowRight') command('step', { frames: event.shiftKey ? 10 : 1 });
      else if (event.key.toLowerCase() === 'k') command('add');
      else if (event.key === 'Delete' || event.key === 'Backspace') command('delete');
      else if (event.key === 'Home') command('seek', { timeMs: 0 });
      else if (event.key === 'End') command('jump-end');
      else handled = false;
      if (handled) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state.mode]);

  if (state.mode !== 'animation') return null;

  const dragTime = (clientX: number): number | null => {
    const track = trackRef.current;
    if (!track || track.clientWidth <= 0) return null;
    const bounds = track.getBoundingClientRect();
    const amount = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return Math.round(amount * state.durationMs);
  };

  return (
    <section className="animation-timeline" aria-label="Animation timeline">
      <div className="animation-transport">
        <div className="animation-transport-group" aria-label="Playback controls">
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
          <button
            type="button"
            aria-label="Jump to animation end"
            onClick={() => command('jump-end')}
          >
            <SkipForward size={14} />
          </button>
        </div>
        <output className="animation-timecode" aria-label="Animation time">
          {formatTime(state.playheadMs)} <i>/</i> {formatTime(state.durationMs)}
        </output>
        <label>
          Duration
          <input
            type="number"
            min="0.1"
            max="3600"
            step="0.1"
            value={state.durationMs / 1000}
            disabled={state.playing}
            onChange={(event) => numericCommand('duration', event.target.value, 1000)}
          />
          s
        </label>
        <label>
          FPS
          <select
            aria-label="Animation FPS"
            value={state.fps}
            disabled={state.playing}
            onChange={(event) => numericCommand('fps', event.target.value)}
          >
            {[24, 30, 60].map((fps) => (
              <option key={fps} value={fps}>
                {fps}
              </option>
            ))}
          </select>
        </label>
        <label className="animation-loop">
          <input
            type="checkbox"
            checked={state.loopPreview}
            disabled={state.playing}
            onChange={(event) => command('loop', { enabled: event.target.checked })}
          />
          Loop
        </label>
        <div
          className="animation-transport-group animation-edit-actions"
          aria-label="Keyframe actions"
        >
          <button
            type="button"
            aria-label="Add keyframe"
            disabled={state.playing}
            onClick={() => command('add')}
          >
            <DiamondPlus size={14} /> Add
          </button>
          <button
            type="button"
            aria-label="Duplicate selected keyframe"
            disabled={!selected || state.playing}
            onClick={() => command('duplicate')}
          >
            <CopyPlus size={14} /> Duplicate
          </button>
          <button
            type="button"
            aria-label="Delete selected keyframe"
            disabled={!selected || selectedIsProtected || state.playing}
            onClick={() => command('delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <button
          type="button"
          className="animation-export-button"
          aria-label="Export video"
          disabled
          title="Video export is added in Phase 6."
        >
          <Download size={14} /> Export video
        </button>
      </div>
      <div className="animation-properties">
        <label>
          Outgoing easing
          <select
            aria-label="Outgoing keyframe easing"
            value={selected?.easingToNext ?? 'linear'}
            disabled={!selectedHasOutgoingSegment || state.playing}
            onChange={(event) => command('easing', { easing: event.target.value })}
          >
            <option value="linear">Linear</option>
            <option value="ease-in">Ease in</option>
            <option value="ease-out">Ease out</option>
            <option value="ease-in-out">Ease in &amp; out</option>
            <option value="hold">Hold</option>
          </select>
        </label>
        <span>{state.canUndo ? 'Animation undo available' : 'Animation history at start'}</span>
      </div>
      <div className="animation-track-scroll">
        <div className="animation-track" ref={trackRef}>
          <input
            type="range"
            min="0"
            max={state.durationMs}
            step={1000 / state.fps}
            value={state.playheadMs}
            disabled={state.playing}
            aria-label="Animation playhead"
            aria-valuetext={formatTime(state.playheadMs)}
            onInput={(event) => command('seek', { timeMs: Number(event.currentTarget.value) })}
          />
          <div className="animation-keyframes" aria-label={`${state.keyframes.length} keyframes`}>
            {state.keyframes.map((keyframe) => {
              const isProtected = keyframe.timeMs === 0;
              return (
                <button
                  type="button"
                  key={keyframe.id}
                  className={state.selectedKeyframeId === keyframe.id ? 'is-selected' : ''}
                  style={{ left: `${(keyframe.timeMs / state.durationMs) * 100}%` }}
                  aria-label={`${isProtected ? 'Protected keyframe' : 'Keyframe'} at ${formatTime(keyframe.timeMs)}`}
                  aria-pressed={state.selectedKeyframeId === keyframe.id}
                  disabled={state.playing}
                  onClick={() => command('select', { id: keyframe.id })}
                  onPointerDown={(event) => {
                    if (isProtected || state.playing) return;
                    draggingId.current = keyframe.id;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    command('select', { id: keyframe.id });
                  }}
                  onPointerMove={(event) => {
                    if (draggingId.current !== keyframe.id) return;
                    const timeMs = dragTime(event.clientX);
                    if (timeMs !== null) command('move', { id: keyframe.id, timeMs });
                  }}
                  onPointerUp={(event) => {
                    if (draggingId.current !== keyframe.id) return;
                    draggingId.current = null;
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                    const timeMs = dragTime(event.clientX);
                    command('move-end', { id: keyframe.id, timeMs });
                  }}
                  onPointerCancel={() => {
                    if (draggingId.current === keyframe.id) {
                      draggingId.current = null;
                      command('move-end', { id: keyframe.id, timeMs: keyframe.timeMs });
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      <p className="animation-help">
        Select a keyframe to edit animated parameters. Between keyframes, controls show calculated
        values and remain read-only. Space plays, arrows step, K adds, and ⌘/Ctrl Z undoes.
      </p>
    </section>
  );
}
