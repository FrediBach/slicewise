import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Checkbox, ValueControl } from './FormControls';

type GradientValue = [position: number, color: string];
type GradientPreset = { name: string; stops: GradientValue[] };
type GradientStop = { id: number; position: number; color: string };
type LineIndexColor = { id: number; index: number; color: string };

let nextStopId = 0;
const createStop = ([position, color]: GradientValue): GradientStop => ({
  id: nextStopId++,
  position,
  color,
});

const GRADIENT_PRESETS: GradientPreset[] = [
  {
    name: 'Rainbow',
    stops: [
      [0, '#ef4444'],
      [0.2, '#f59e0b'],
      [0.4, '#84cc16'],
      [0.6, '#06b6d4'],
      [0.8, '#3b82f6'],
      [1, '#8b5cf6'],
    ],
  },
  {
    name: 'Sunset',
    stops: [
      [0, '#4c1d95'],
      [0.42, '#db2777'],
      [0.72, '#f97316'],
      [1, '#facc15'],
    ],
  },
  {
    name: 'Ocean',
    stops: [
      [0, '#082f49'],
      [0.5, '#0891b2'],
      [1, '#a7f3d0'],
    ],
  },
  {
    name: 'Earth',
    stops: [
      [0, '#292524'],
      [0.42, '#854d0e'],
      [0.7, '#65a30d'],
      [1, '#d9f99d'],
    ],
  },
  {
    name: 'Mono',
    stops: [
      [0, '#111827'],
      [1, '#d1d5db'],
    ],
  },
];

function GradientChooser() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [stops, setStops] = useState<GradientStop[]>(() =>
    GRADIENT_PRESETS[0].stops.map(createStop),
  );
  const [preset, setPreset] = useState('Rainbow');

  useEffect(() => {
    rootRef.current?.dispatchEvent(
      new CustomEvent('gradientchange', {
        bubbles: true,
        detail: { stops: stops.map(({ position, color }) => ({ position, color })) },
      }),
    );
  }, [stops]);

  useEffect(() => {
    const setGradient = (
      event: CustomEvent<{ gradientStops?: Array<{ position: number; color: string }> }>,
    ) => {
      if (event.detail?.gradientStops) {
        setPreset('');
        setStops(
          event.detail.gradientStops.map(({ position, color }) => createStop([position, color])),
        );
      }
    };
    document.addEventListener('restoreparameters', setGradient);
    document.addEventListener('setgradient', setGradient);
    return () => {
      document.removeEventListener('restoreparameters', setGradient);
      document.removeEventListener('setgradient', setGradient);
    };
  }, []);

  const updateStop = (id: number, next: GradientValue) => {
    setPreset('');
    setStops((current) =>
      current
        .map((stop) => (stop.id === id ? { ...stop, position: next[0], color: next[1] } : stop))
        .sort((a, b) => a.position - b.position),
    );
  };
  const removeStop = (id: number) => {
    if (stops.length <= 2) return;
    setPreset('');
    setStops((current) => current.filter((stop) => stop.id !== id));
  };
  const addStop = () => {
    let widest = -1,
      insertAt = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const gap = stops[i + 1].position - stops[i].position;
      if (gap > widest) {
        widest = gap;
        insertAt = i;
      }
    }
    const a = stops[insertAt],
      b = stops[insertAt + 1];
    setPreset('');
    const midpoint = createStop([(a.position + b.position) / 2, a.color]);
    setStops((current) => [...current, midpoint].sort((x, y) => x.position - y.position));
  };

  const cssGradient = `linear-gradient(90deg, ${stops.map(({ position, color }) => `${color} ${Math.round(position * 100)}%`).join(', ')})`;
  return (
    <>
      <div className="gradient-editor" id="gradientEditor" ref={rootRef}>
        <Checkbox id="gradientEnabled" randomizable>
          Use colour gradient
        </Checkbox>
        <div className="gradient-panel" id="gradientPanel">
          <div
            className="gradient-preview"
            style={{ background: cssGradient }}
            aria-label="Current gradient preview"
          />
          <div className="gradient-presets" aria-label="Gradient presets">
            {GRADIENT_PRESETS.map((item) => (
              <button
                key={item.name}
                type="button"
                className={preset === item.name ? 'active' : ''}
                onClick={() => {
                  setPreset(item.name);
                  setStops(item.stops.map(createStop));
                }}
              >
                <span
                  style={{
                    background: `linear-gradient(90deg, ${item.stops.map(([p, c]) => `${c} ${p * 100}%`).join(', ')})`,
                  }}
                />
                {item.name}
              </button>
            ))}
          </div>
          <div className="gradient-stops">
            {stops.map(({ id, position, color }, index) => (
              <div className="gradient-stop" key={id}>
                <input
                  type="color"
                  value={color}
                  aria-label={`Stop ${index + 1} colour`}
                  onChange={(e) => updateStop(id, [position, e.target.value])}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(position * 100)}
                  aria-label={`Stop ${index + 1} position`}
                  onChange={(e) => updateStop(id, [Number(e.target.value) / 100, color])}
                />
                <span>{Math.round(position * 100)}%</span>
                <button
                  type="button"
                  onClick={() => removeStop(id)}
                  disabled={stops.length <= 2}
                  aria-label={`Remove stop ${index + 1}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="add-stop" onClick={addStop}>
            <Plus size={12} /> Add colour stop
          </button>
          <ValueControl
            id="gradientColors"
            label="Pen colours"
            min="2"
            max="24"
            step="1"
            value="6"
          />
          <p className="gradient-note">
            The gradient is sampled into separate, plotter-ready paths.
          </p>
        </div>
      </div>
      <LineIndexColorChooser />
    </>
  );
}

let nextLineColorId = 0;
const createLineColor = (index: number, color: string): LineIndexColor => ({
  id: nextLineColorId++,
  index,
  color,
});

function LineIndexColorChooser() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<LineIndexColor[]>(() => [createLineColor(1, '#ef4444')]);

  useEffect(() => {
    rootRef.current?.dispatchEvent(
      new CustomEvent('lineindexcolorschange', {
        bubbles: true,
        detail: { colors: colors.map(({ index, color }) => ({ index, color })) },
      }),
    );
  }, [colors]);

  useEffect(() => {
    const restore = (
      event: CustomEvent<{ lineIndexColors?: Array<{ index: number; color: string }> }>,
    ) => {
      if (event.detail?.lineIndexColors?.length) {
        setColors(
          event.detail.lineIndexColors.map(({ index, color }) => createLineColor(index, color)),
        );
      }
    };
    document.addEventListener('restoreparameters', restore);
    return () => document.removeEventListener('restoreparameters', restore);
  }, []);

  const update = (id: number, values: Partial<Omit<LineIndexColor, 'id'>>) =>
    setColors((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...values } : entry)),
    );

  return (
    <div className="line-index-editor" id="lineIndexColorEditor" ref={rootRef}>
      <Checkbox id="lineIndexColorEnabled">Colour by line index</Checkbox>
      <div className="line-index-panel">
        {colors.map(({ id, index, color }, position) => (
          <div className="line-index-color" key={id}>
            <label htmlFor={`lineIndexColor-${id}`}>Line</label>
            <input
              id={`lineIndexColor-${id}`}
              type="number"
              min="1"
              max="9999"
              step="1"
              value={index}
              aria-label={`Line index ${position + 1}`}
              onChange={(event) =>
                update(id, {
                  index: Math.min(9999, Math.max(1, Math.round(Number(event.target.value) || 1))),
                })
              }
            />
            <input
              type="color"
              value={color}
              aria-label={`Line index ${position + 1} colour`}
              onChange={(event) => update(id, { color: event.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove line colour ${position + 1}`}
              disabled={colors.length <= 1}
              onClick={() => setColors((current) => current.filter((entry) => entry.id !== id))}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-stop"
          onClick={() =>
            setColors((current) => [
              ...current,
              createLineColor(
                Math.min(9999, Math.max(...current.map((entry) => entry.index)) + 1),
                current.at(-1)?.color || '#ef4444',
              ),
            ])
          }
        >
          <Plus size={12} /> Add line colour
        </button>
        <p className="gradient-note">
          Line numbers start at 1; repeated indexes use the last entry.
        </p>
      </div>
    </div>
  );
}

export { GradientChooser };
