import { useId, useState, type CSSProperties } from 'react';

/** Native radios retain keyboard navigation while presenting instrument-style buttons. */
export function InstrumentChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <div className="instrument-choice" role="group" aria-label={label}>
      {options.map(([option, caption]) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            aria-label={`${label}: ${caption}`}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{caption}</span>
        </label>
      ))}
    </div>
  );
}

export function InstrumentFader({
  label,
  ariaLabel,
  value,
  min = 0,
  max = 100,
  unit = '%',
  disabled = false,
  bipolar = false,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
  bipolar?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const update = (next: number) => onChange(Math.max(min, Math.min(max, Math.round(next))));
  const position = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="instrument-fader" data-disabled={disabled || undefined}>
      <div className="instrument-fader-heading">
        <label htmlFor={id}>{label}</label>
        <div className="instrument-value">
          <button
            type="button"
            aria-label={`Decrease ${ariaLabel}`}
            disabled={disabled || value <= min}
            onClick={() => update(value - 1)}
          >
            −
          </button>
          <input
            type="number"
            aria-label={ariaLabel}
            value={draft ?? value}
            min={min}
            max={max}
            step={1}
            disabled={disabled}
            onFocus={(event) => {
              setDraft(String(value));
              event.target.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (
                draft !== null &&
                draft.trim() !== '' &&
                Number.isFinite(Number(draft)) &&
                Number(draft) !== value
              )
                update(Number(draft));
              setDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(null);
              }
            }}
          />
          <span>{unit}</span>
          <button
            type="button"
            aria-label={`Increase ${ariaLabel}`}
            disabled={disabled || value >= max}
            onClick={() => update(value + 1)}
          >
            +
          </button>
        </div>
      </div>
      <input
        id={id}
        type="range"
        aria-label={`${ariaLabel} slider`}
        aria-valuetext={`${value}${unit}`}
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        style={
          {
            '--fader-start': `${bipolar ? Math.min(50, position) : 0}%`,
            '--fader-end': `${bipolar ? Math.max(50, position) : position}%`,
          } as CSSProperties
        }
        onChange={(event) => {
          setDraft(null);
          update(Number(event.target.value));
        }}
      />
      <div className="instrument-fader-scale" aria-hidden="true">
        <span>
          {min}
          {unit}
        </span>
        {bipolar && <span>0</span>}
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
