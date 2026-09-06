export const WEATHER_COLOR_CONTROLS = [
  { id: 'weatherLowColor', label: 'Low colour', defaultValue: '#276419' },
  { id: 'weatherMidColor', label: 'Midpoint colour', defaultValue: '#ffffff' },
  { id: 'weatherHighColor', label: 'High colour', defaultValue: '#8e0152' },
] as const;

type WeatherColorKey = (typeof WEATHER_COLOR_CONTROLS)[number]['id'];
export type WeatherColors = Partial<Record<WeatherColorKey, string>>;

export function resolveWeatherColors(settings: WeatherColors): Record<WeatherColorKey, string> {
  return Object.fromEntries(
    WEATHER_COLOR_CONTROLS.map(({ id, defaultValue }) => [
      id,
      /^#[0-9a-f]{6}$/i.test(settings[id] ?? '') ? settings[id]!.toLowerCase() : defaultValue,
    ]),
  ) as Record<WeatherColorKey, string>;
}

/** Eleven discrete bands, blending each extreme towards the chosen midpoint. */
export function weatherPalette(settings: WeatherColors): string[] {
  const colors = resolveWeatherColors(settings);
  const rgb = (hex: string) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const low = rgb(colors.weatherLowColor);
  const mid = rgb(colors.weatherMidColor);
  const high = rgb(colors.weatherHighColor);
  return Array.from({ length: 11 }, (_, index) => {
    const a = index <= 5 ? low : mid;
    const b = index <= 5 ? mid : high;
    const t = index <= 5 ? index / 5 : (index - 5) / 5;
    return (
      '#' +
      a
        .map((channel, i) =>
          Math.round(channel + (b[i] - channel) * t)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  });
}

/** Fill only intact loops. Largest first lets nested contours form opaque bands. */
export function weatherBandFills(groups: Array<{ color: string; runs: number[][] }>): {
  svg: string;
  paths: number;
  nodes: number;
} {
  const loops = groups
    .flatMap(({ color, runs }) =>
      runs.flatMap((run) => {
        if (
          run.length < 8 ||
          run.length % 2 ||
          !run.every(Number.isFinite) ||
          Math.hypot(run[0] - run[run.length - 2], run[1] - run[run.length - 1]) > 1e-6
        )
          return [];
        let area = 0;
        for (let i = 2; i < run.length; i += 2)
          area += run[i - 2] * run[i + 1] - run[i] * run[i - 1];
        if (Math.abs(area) < 1e-8) return [];
        return [{ run, color, area: Math.abs(area) }];
      }),
    )
    .sort((a, b) => b.area - a.area);
  const svg = loops
    .map(({ run, color }) => {
      const points = [];
      for (let i = 0; i < run.length; i += 2)
        points.push(`${run[i].toFixed(3)},${run[i + 1].toFixed(3)}`);
      return `<path fill="${color}" stroke="none" d="M${points.join('L')}Z"/>`;
    })
    .join('');
  return {
    svg: svg ? `<g data-effect="weather-bands">${svg}</g>` : '',
    paths: loops.length,
    nodes: loops.reduce((sum, { run }) => sum + run.length / 2, 0),
  };
}
