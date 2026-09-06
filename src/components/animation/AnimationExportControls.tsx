import {
  ANIMATION_EXPORT_BITRATES,
  ANIMATION_EXPORT_LONG_EDGES,
  type AnimationExportSettings,
} from '../../lib/animation-project';

type Props = {
  settings: AnimationExportSettings;
  durationMs: number;
  disabled: boolean;
  onResolution: (longEdge: number) => void;
  onBitrate: (bitrate: number) => void;
};

export function AnimationExportControls({
  settings,
  durationMs,
  disabled,
  onResolution,
  onBitrate,
}: Props) {
  const longEdge = Math.max(settings.width, settings.height);
  const customResolution = !ANIMATION_EXPORT_LONG_EDGES.some((value) => value === longEdge);
  const customBitrate = !ANIMATION_EXPORT_BITRATES.includes(settings.bitrate);
  const estimatedMB = (settings.bitrate * durationMs) / 8_000_000_000;
  return (
    <div className="animation-export-settings" role="group" aria-label="Video export settings">
      <label>
        Resolution
        <select
          aria-label="Video export resolution"
          value={longEdge}
          disabled={disabled}
          onChange={(event) => onResolution(Number(event.target.value))}
        >
          {customResolution && <option value={longEdge}>{longEdge} px · saved</option>}
          {ANIMATION_EXPORT_LONG_EDGES.map((value) => (
            <option key={value} value={value}>
              {value} px · long edge
            </option>
          ))}
        </select>
      </label>
      <label>
        Bitrate
        <select
          aria-label="Video export bitrate"
          value={settings.bitrate}
          disabled={disabled}
          onChange={(event) => onBitrate(Number(event.target.value))}
        >
          {customBitrate && (
            <option value={settings.bitrate}>{settings.bitrate / 1_000_000} Mbps · saved</option>
          )}
          {ANIMATION_EXPORT_BITRATES.map((value) => (
            <option key={value} value={value}>
              {value / 1_000_000} Mbps
            </option>
          ))}
        </select>
      </label>
      <output aria-label="Video export size">
        {settings.width} × {settings.height} px · ~{estimatedMB.toFixed(1)} MB
      </output>
      <span className="animation-export-hint">
        Higher resolution preserves fine lines. Higher bitrate reduces compression. File size is an
        estimate.
      </span>
    </div>
  );
}
