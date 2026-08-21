import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Checkbox, ValueControl } from './FormControls';

type GradientStop = [position: number, color: string];
type GradientPreset = { name: string; stops: GradientStop[] };

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
  const [stops, setStops] = useState<GradientStop[]>(GRADIENT_PRESETS[0].stops);
  const [preset, setPreset] = useState('Rainbow');

  useEffect(() => {
    rootRef.current?.dispatchEvent(
      new CustomEvent('gradientchange', {
        bubbles: true,
        detail: { stops: stops.map(([position, color]) => ({ position, color })) },
      }),
    );
  }, [stops]);

  useEffect(() => {
    const restore = (
      event: CustomEvent<{ gradientStops?: Array<{ position: number; color: string }> }>,
    ) => {
      if (event.detail?.gradientStops) {
        setPreset('');
        setStops(event.detail.gradientStops.map((stop) => [stop.position, stop.color]));
      }
    };
    document.addEventListener('restoreparameters', restore);
    return () => document.removeEventListener('restoreparameters', restore);
  }, []);

  const updateStop = (index: number, next: GradientStop) => {
    setPreset('');
    setStops((current) =>
      current.map((stop, i) => (i === index ? next : stop)).sort((a, b) => a[0] - b[0]),
    );
  };
  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    setPreset('');
    setStops((current) => current.filter((_, i) => i !== index));
  };
  const addStop = () => {
    let widest = -1,
      insertAt = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const gap = stops[i + 1][0] - stops[i][0];
      if (gap > widest) {
        widest = gap;
        insertAt = i;
      }
    }
    const a = stops[insertAt],
      b = stops[insertAt + 1];
    setPreset('');
    const midpoint: GradientStop = [(a[0] + b[0]) / 2, a[1]];
    setStops((current) => [...current, midpoint].sort((x, y) => x[0] - y[0]));
  };

  const cssGradient = `linear-gradient(90deg, ${stops.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;
  return (
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
                setStops(item.stops);
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
          {stops.map(([position, color], index) => (
            <div className="gradient-stop" key={index}>
              <input
                type="color"
                value={color}
                aria-label={`Stop ${index + 1} colour`}
                onChange={(e) => updateStop(index, [position, e.target.value])}
              />
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(position * 100)}
                aria-label={`Stop ${index + 1} position`}
                onChange={(e) => updateStop(index, [Number(e.target.value) / 100, color])}
              />
              <span>{Math.round(position * 100)}%</span>
              <button
                type="button"
                onClick={() => removeStop(index)}
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
        <ValueControl id="gradientColors" label="Pen colours" min="2" max="24" step="1" value="6" />
        <p className="gradient-note">The gradient is sampled into separate, plotter-ready paths.</p>
      </div>
    </div>
  );
}

export { GradientChooser };
