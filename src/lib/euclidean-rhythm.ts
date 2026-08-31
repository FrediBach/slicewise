function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(Number.isFinite(value) ? value : minimum)));
}

/** Returns a canonical Bjorklund pattern beginning with a hit. */
export function euclideanRhythm(steps: number, pulses: number): boolean[] {
  const stepCount = clampInteger(steps, 1, 64);
  const pulseCount = clampInteger(pulses, 0, stepCount);
  if (!pulseCount) return Array.from({ length: stepCount }, () => false);
  if (pulseCount === stepCount) return Array.from({ length: stepCount }, () => true);

  const counts: number[] = [];
  const remainders = [pulseCount];
  let divisor = stepCount - pulseCount;
  let level = 0;
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
  }
  counts.push(divisor);

  const pattern: boolean[] = [];
  const build = (currentLevel: number): void => {
    if (currentLevel === -1) pattern.push(false);
    else if (currentLevel === -2) pattern.push(true);
    else {
      for (let index = 0; index < counts[currentLevel]; index++) build(currentLevel - 1);
      if (remainders[currentLevel]) build(currentLevel - 2);
    }
  };
  build(level);
  const firstHit = pattern.indexOf(true);
  return firstHit > 0 ? rotateRhythm(pattern, -firstHit) : pattern;
}

export function rotateRhythm(pattern: readonly boolean[], rotation: number): boolean[] {
  if (!pattern.length) return [];
  const offset = ((Math.round(rotation) % pattern.length) + pattern.length) % pattern.length;
  const rotated = Array.from({ length: pattern.length }, () => false);
  for (let index = 0; index < pattern.length; index++)
    rotated[(index + offset) % pattern.length] = pattern[index];
  return rotated;
}

function resampleEnergy(energy: readonly number[], steps: number): number[] {
  if (!energy.length) return Array.from({ length: steps }, () => 0);
  if (energy.length === steps) return energy.map((value) => (Number.isFinite(value) ? value : 0));
  return Array.from({ length: steps }, (_, index) => {
    const start = (index * energy.length) / steps;
    const end = ((index + 1) * energy.length) / steps;
    let weighted = 0;
    let weight = 0;
    for (let source = Math.floor(start); source < Math.ceil(end); source++) {
      const overlap = Math.max(0, Math.min(end, source + 1) - Math.max(start, source));
      if (!overlap) continue;
      weighted += (Number.isFinite(energy[source]) ? energy[source] : 0) * overlap;
      weight += overlap;
    }
    return weight ? weighted / weight : 0;
  });
}

/** Selects the stable rotation whose Euclidean hits cover the strongest shape energy. */
export function autoRotateEuclidean(
  steps: number,
  pulses: number,
  contourEnergy: readonly number[],
): { rotation: number; pattern: boolean[] } {
  const base = euclideanRhythm(steps, pulses);
  const energy = resampleEnergy(contourEnergy, base.length);
  let bestRotation = 0;
  let bestScore = -Infinity;
  for (let rotation = 0; rotation < base.length; rotation++) {
    const candidate = rotateRhythm(base, rotation);
    const score = candidate.reduce((sum, hit, index) => sum + (hit ? energy[index] : 0), 0);
    if (score > bestScore + 1e-12) {
      bestScore = score;
      bestRotation = rotation;
    }
  }
  return { rotation: bestRotation, pattern: rotateRhythm(base, bestRotation) };
}
