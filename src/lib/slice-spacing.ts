const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function applyLineGapEase(t: number, easing: string, center: number): number {
  const left = t / center,
    right = (t - center) / (1 - center);
  switch (easing) {
    case 'sine-in':
      return 1 - Math.cos((t * Math.PI) / 2);
    case 'sine-out':
      return Math.sin((t * Math.PI) / 2);
    case 'sine-in-out':
      return t < center
        ? center * (1 - Math.cos((left * Math.PI) / 2))
        : center + (1 - center) * Math.sin((right * Math.PI) / 2);
    case 'sine-out-in':
      return t < center
        ? center * Math.sin((left * Math.PI) / 2)
        : center + (1 - center) * (1 - Math.cos((right * Math.PI) / 2));
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t < center
        ? center * left * left
        : center + (1 - center) * (1 - Math.pow(1 - right, 2));
    case 'ease-out-in':
      return t < center
        ? center * (1 - Math.pow(1 - left, 2))
        : center + (1 - center) * right * right;
    case 'cubic-in':
      return t * t * t;
    case 'cubic-out':
      return 1 - Math.pow(1 - t, 3);
    case 'cubic-in-out':
      return t < center
        ? center * left * left * left
        : center + (1 - center) * (1 - Math.pow(1 - right, 3));
    case 'cubic-out-in':
      return t < center
        ? center * (1 - Math.pow(1 - left, 3))
        : center + (1 - center) * right * right * right;
    default:
      return t;
  }
}

export function easeLineGap(
  t: number,
  easing: string,
  strength = 100,
  center = 50,
  cycles = 1,
): number {
  const cycleCount = clamp(Math.round(cycles), 1, 12);
  const scaled = t * cycleCount;
  const cycle = Math.min(cycleCount - 1, Math.floor(scaled));
  const local = scaled - cycle;
  const applications = clamp(strength / 100, 0, 3);
  const pivot = clamp(center / 100, 0.05, 0.95);
  const whole = Math.floor(applications),
    mix = applications - whole;
  let eased = local;
  for (let i = 0; i < whole; i++) eased = applyLineGapEase(eased, easing, pivot);
  if (mix) {
    const next = applyLineGapEase(eased, easing, pivot);
    eased += (next - eased) * mix;
  }
  return (cycle + eased) / cycleCount;
}
