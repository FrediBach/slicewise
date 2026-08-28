export type NumericPolyline = ArrayLike<number> & Iterable<number>;
export type Polyline = number[];

type Vec2 = [x: number, y: number];

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/** Marks corners that must survive simplification and curve serialization. */
export function sharpVertices(run: NumericPolyline): Uint8Array {
  const countWithClosure = run.length / 2;
  const sharp = new Uint8Array(countWithClosure);
  const closed =
    countWithClosure > 3 &&
    Math.hypot(
      run[0] - run[(countWithClosure - 1) * 2],
      run[1] - run[(countWithClosure - 1) * 2 + 1],
    ) < 1e-5;
  const count = closed ? countWithClosure - 1 : countWithClosure;
  const threshold = (35 * Math.PI) / 180;
  const point = (index: number): Vec2 => {
    if (closed) index = ((index % count) + count) % count;
    else index = clamp(index, 0, count - 1);
    return [run[index * 2], run[index * 2 + 1]];
  };
  for (let index = closed ? 0 : 1; index < (closed ? count : count - 1); index++) {
    const previous = point(index - 1);
    const current = point(index);
    const next = point(index + 1);
    const incomingX = current[0] - previous[0];
    const incomingY = current[1] - previous[1];
    const outgoingX = next[0] - current[0];
    const outgoingY = next[1] - current[1];
    const denominator = Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);
    if (!denominator) continue;
    const turn = Math.atan2(
      Math.abs(incomingX * outgoingY - incomingY * outgoingX),
      incomingX * outgoingX + incomingY * outgoingY,
    );
    if (turn >= threshold) sharp[index] = 1;
  }
  if (closed) sharp[countWithClosure - 1] = sharp[0];
  return sharp;
}

/** Iterative Ramer-Douglas-Peucker simplification that preserves sharp corners. */
export function simplifyPolyline(
  run: Polyline,
  tolerance: number,
): { run: Polyline; sharp: Uint8Array } {
  const count = run.length / 2;
  const sourceSharp = sharpVertices(run);
  if (count < 3) return { run, sharp: sourceSharp };
  const keep = new Uint8Array(count);
  keep[0] = keep[count - 1] = 1;
  for (let index = 1; index < count - 1; index++) if (sourceSharp[index]) keep[index] = 1;
  const stack: Array<[number, number]> = [[0, count - 1]];
  const squaredTolerance = tolerance * tolerance;
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop()!;
    if (endIndex - startIndex < 2) continue;
    const startX = run[startIndex * 2];
    const startY = run[startIndex * 2 + 1];
    const endX = run[endIndex * 2];
    const endY = run[endIndex * 2 + 1];
    const dx = endX - startX;
    const dy = endY - startY;
    const squaredLength = dx * dx + dy * dy;
    let farthest = -1;
    let best = squaredTolerance;
    for (let index = startIndex + 1; index < endIndex; index++) {
      const pointX = run[index * 2] - startX;
      const pointY = run[index * 2 + 1] - startY;
      let squaredDistance: number;
      if (squaredLength === 0) squaredDistance = pointX * pointX + pointY * pointY;
      else {
        const position = clamp((pointX * dx + pointY * dy) / squaredLength, 0, 1);
        const errorX = pointX - dx * position;
        const errorY = pointY - dy * position;
        squaredDistance = errorX * errorX + errorY * errorY;
      }
      if (squaredDistance > best) {
        best = squaredDistance;
        farthest = index;
      }
    }
    if (farthest > 0) {
      keep[farthest] = 1;
      stack.push([startIndex, farthest], [farthest, endIndex]);
    }
  }
  const simplified: number[] = [];
  const simplifiedSharp: number[] = [];
  for (let index = 0; index < count; index++) {
    if (!keep[index]) continue;
    simplified.push(run[index * 2], run[index * 2 + 1]);
    simplifiedSharp.push(sourceSharp[index]);
  }
  return { run: simplified, sharp: Uint8Array.from(simplifiedSharp) };
}

/** Applies deterministic, coordinate-seeded hand-drawn displacement. */
export function humanizePolyline(run: Polyline, amount: number, salt = 0): Polyline {
  const strength = clamp(Number(amount) || 0, 0, 100) / 100;
  const count = run.length / 2;
  if (!strength || count < 2) return run;
  const closed =
    count > 3 &&
    Math.hypot(run[0] - run[(count - 1) * 2], run[1] - run[(count - 1) * 2 + 1]) < 1e-5;
  const uniqueCount = closed ? count - 1 : count;
  if (uniqueCount < 2) return run;

  let hash = (0x811c9dc5 ^ salt) >>> 0;
  const sampleCount = Math.min(uniqueCount, 8);
  for (let index = 0; index < sampleCount; index++) {
    hash ^= Math.round(run[index * 2] * 1000);
    hash = Math.imul(hash, 0x01000193);
    hash ^= Math.round(run[index * 2 + 1] * 1000);
    hash = Math.imul(hash, 0x01000193);
  }
  const random = (): number => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return (hash >>> 0) / 4294967296;
  };
  const phases = [random(), random(), random(), random()].map((value) => value * Math.PI * 2);
  const amplitude = 0.08 + strength * 0.62;
  const spacing = 4.8 - strength * 2.2;
  const points: number[] = [];
  let distance = 0;
  const segmentCount = closed ? uniqueCount : uniqueCount - 1;
  for (let index = 0; index < segmentCount; index++) {
    const next = (index + 1) % uniqueCount;
    const startX = run[index * 2];
    const startY = run[index * 2 + 1];
    const endX = run[next * 2];
    const endY = run[next * 2 + 1];
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const divisions = Math.max(1, Math.ceil(length / spacing));
    for (let part = 0; part < divisions; part++) {
      const position = part / divisions;
      const travelled = distance + length * position;
      const normalX = -dy / length;
      const normalY = dx / length;
      const tangentX = dx / length;
      const tangentY = dy / length;
      const normal =
        amplitude *
        (0.58 * Math.sin(travelled * 0.19 + phases[0]) +
          0.29 * Math.sin(travelled * 0.47 + phases[1]) +
          0.13 * Math.sin(travelled * 1.07 + phases[2]));
      const along = amplitude * 0.13 * Math.sin(travelled * 0.31 + phases[3]);
      points.push(
        startX + dx * position + normalX * normal + tangentX * along,
        startY + dy * position + normalY * normal + tangentY * along,
      );
    }
    distance += length;
  }
  if (!closed) {
    const index = uniqueCount - 2;
    const startX = run[index * 2];
    const startY = run[index * 2 + 1];
    const endX = run[(index + 1) * 2];
    const endY = run[(index + 1) * 2 + 1];
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy) || 1;
    const normal =
      amplitude *
      (0.58 * Math.sin(distance * 0.19 + phases[0]) +
        0.29 * Math.sin(distance * 0.47 + phases[1]) +
        0.13 * Math.sin(distance * 1.07 + phases[2]));
    const along = amplitude * 0.13 * Math.sin(distance * 0.31 + phases[3]);
    points.push(
      endX - (dy / length) * normal + (dx / length) * along,
      endY + (dx / length) * normal + (dy / length) * along,
    );
  } else if (points.length >= 2) points.push(points[0], points[1]);
  return points.length >= 4 ? points : run;
}

export function polylineHash(run: NumericPolyline, salt = 0): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  const stride = Math.max(2, Math.floor(run.length / 12 / 2) * 2);
  for (let index = 0; index < run.length; index += stride) {
    hash ^= Math.round(run[index] * 100);
    hash = Math.imul(hash, 0x01000193);
    hash ^= Math.round(run[index + 1] * 100);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function polylineDistances(run: NumericPolyline): number[] {
  const distances = [0];
  for (let index = 2; index < run.length; index += 2) {
    distances.push(
      distances.at(-1)! + Math.hypot(run[index] - run[index - 2], run[index + 1] - run[index - 1]),
    );
  }
  return distances;
}

function pointAlong(run: NumericPolyline, distances: readonly number[], distance: number): Vec2 {
  const total = distances.at(-1) || 0;
  const target = clamp(distance, 0, total);
  let index = 1;
  while (index < distances.length && distances[index] < target) index++;
  if (index >= distances.length) return [run[run.length - 2], run[run.length - 1]];
  const start = distances[index - 1];
  const span = distances[index] - start;
  const position = span ? (target - start) / span : 0;
  return [
    run[(index - 1) * 2] + (run[index * 2] - run[(index - 1) * 2]) * position,
    run[(index - 1) * 2 + 1] + (run[index * 2 + 1] - run[(index - 1) * 2 + 1]) * position,
  ];
}

function slicePolyline(
  run: Polyline,
  distances: readonly number[],
  startDistance: number,
  endDistance: number,
): Polyline {
  const start = pointAlong(run, distances, startDistance);
  const end = pointAlong(run, distances, endDistance);
  const sliced: Polyline = [...start];
  for (let index = 1; index + 1 < distances.length; index++) {
    if (distances[index] > startDistance && distances[index] < endDistance)
      sliced.push(run[index * 2], run[index * 2 + 1]);
  }
  sliced.push(...end);
  return sliced;
}

interface YarnCurlStyle {
  replacementLength: number;
  drawnLength: number;
  turn: number;
  direction: number;
  irregularity: number;
  phase: number;
}

function curlRunEnd(run: Polyline, atStart: boolean, style: YarnCurlStyle): Polyline {
  const distances = polylineDistances(run);
  const total = distances.at(-1) || 0;
  if (total < 2) return run;
  const replacementLength = Math.min(total * 0.48, style.replacementLength);
  const drawnLength = Math.min(total * 0.9, style.drawnLength);
  const anchorDistance = atStart ? replacementLength : total - replacementLength;
  const anchor = pointAlong(run, distances, anchorDistance);
  const epsilon = Math.min(0.3, replacementLength * 0.12);
  const before = pointAlong(run, distances, Math.max(0, anchorDistance - epsilon));
  const after = pointAlong(run, distances, Math.min(total, anchorDistance + epsilon));
  const dx = after[0] - before[0];
  const dy = after[1] - before[1];
  const length = Math.hypot(dx, dy) || 1;
  const outward = Math.atan2(dy / length, dx / length) + (atStart ? Math.PI : 0);
  const samples = clamp(Math.ceil(drawnLength / 0.65), 14, 42);
  const stepLength = drawnLength / samples;
  const curl: Polyline = [...anchor];
  let x = anchor[0];
  let y = anchor[1];
  for (let part = 1; part <= samples; part++) {
    const progress = (part - 0.5) / samples;
    const turnProgress = Math.pow(progress, 0.72);
    const wobble =
      style.irregularity *
      Math.sin(style.phase + progress * Math.PI * 2.3) *
      Math.sin(progress * Math.PI);
    const angle = outward + style.direction * style.turn * turnProgress + wobble;
    const spacingVariation = 1 + 0.13 * Math.sin(style.phase * 0.7 + progress * Math.PI * 3.1);
    x += Math.cos(angle) * stepLength * spacingVariation;
    y += Math.sin(angle) * stepLength * spacingVariation;
    curl.push(x, y);
  }
  if (atStart) {
    const reversedCurl: Polyline = [];
    for (let index = curl.length - 2; index >= 0; index -= 2)
      reversedCurl.push(curl[index], curl[index + 1]);
    const remainder = slicePolyline(run, distances, anchorDistance, total);
    return [...reversedCurl, ...remainder.slice(2)];
  }
  const remainder = slicePolyline(run, distances, 0, anchorDistance);
  return [...remainder.slice(0, -2), ...curl];
}

/** Replaces deterministic gaps in a run with independently curled ends. */
export function cutYarnPolyline(
  run: Polyline,
  seed: number,
  sizePercent: number,
  requestedCuts: number,
): Polyline[] {
  const distances = polylineDistances(run);
  const total = distances.at(-1) || 0;
  const cutCount = Math.min(Math.max(1, Math.round(requestedCuts)), Math.floor(total / 6));
  if (total < 12 || cutCount < 1) return [run];
  let hash = seed || 1;
  const random = (): number => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return (hash >>> 0) / 4294967296;
  };
  const size = clamp(Number(sizePercent) || 100, 25, 250) / 100;
  const randomCurlStyle = (): YarnCurlStyle => ({
    replacementLength: (5 + random() * 11) * size,
    drawnLength: (9 + random() * 19) * size,
    turn: ((100 + random() * 240) * Math.PI) / 180,
    direction: random() < 0.5 ? -1 : 1,
    irregularity: ((5 + random() * 24) * Math.PI) / 180,
    phase: random() * Math.PI * 2,
  });
  const closed = run.length >= 8 && Math.hypot(run[0] - run.at(-2)!, run[1] - run.at(-1)!) < 1e-5;
  type YarnCut = {
    leftDistance: number;
    rightDistance: number;
    leftStyle: YarnCurlStyle;
    rightStyle: YarnCurlStyle;
  };
  if (!closed) {
    const cuts: YarnCut[] = [];
    const start = total * 0.1;
    const span = total * 0.8;
    for (let index = 0; index < cutCount; index++) {
      const centre = start + ((index + 0.2 + random() * 0.6) / cutCount) * span;
      const gap = Math.min(total / (cutCount * 5), 0.8 + random() * 3.7);
      cuts.push({
        leftDistance: centre - gap / 2,
        rightDistance: centre + gap / 2,
        leftStyle: randomCurlStyle(),
        rightStyle: randomCurlStyle(),
      });
    }
    cuts.sort((left, right) => left.leftDistance - right.leftDistance);
    const pieces: Polyline[] = [];
    const first = slicePolyline(run, distances, 0, cuts[0].leftDistance);
    pieces.push(curlRunEnd(first, false, cuts[0].leftStyle));
    for (let index = 0; index + 1 < cuts.length; index++) {
      const current = cuts[index];
      const next = cuts[index + 1];
      const middle = slicePolyline(run, distances, current.rightDistance, next.leftDistance);
      pieces.push(curlRunEnd(curlRunEnd(middle, true, current.rightStyle), false, next.leftStyle));
    }
    const lastCut = cuts.at(-1)!;
    const last = slicePolyline(run, distances, lastCut.rightDistance, total);
    pieces.push(curlRunEnd(last, true, lastCut.rightStyle));
    return pieces;
  }
  const offset = random() / cutCount;
  const cuts: YarnCut[] = [];
  for (let index = 0; index < cutCount; index++) {
    const centre = (((index + 0.2 + random() * 0.6) / cutCount + offset) % 1) * total;
    const gap = Math.min(total / (cutCount * 5), 0.8 + random() * 3.7);
    cuts.push({
      leftDistance: Math.max(0, centre - gap / 2),
      rightDistance: Math.min(total, centre + gap / 2),
      leftStyle: randomCurlStyle(),
      rightStyle: randomCurlStyle(),
    });
  }
  cuts.sort((left, right) => left.leftDistance - right.leftDistance);
  const pieces: Polyline[] = [];
  for (let index = 0; index < cuts.length; index++) {
    const current = cuts[index];
    const next = cuts[(index + 1) % cuts.length];
    const middle =
      index + 1 < cuts.length
        ? slicePolyline(run, distances, current.rightDistance, next.leftDistance)
        : [
            ...slicePolyline(run, distances, current.rightDistance, total),
            ...slicePolyline(run, distances, 0, next.leftDistance).slice(2),
          ];
    pieces.push(curlRunEnd(curlRunEnd(middle, true, current.rightStyle), false, next.leftStyle));
  }
  return pieces;
}

/** Selects runs and cut counts deterministically from a 0-500 percent density. */
export function selectYarnPolylines(
  runs: readonly Polyline[],
  percent: number,
): Map<Polyline, number> {
  const eligible: Array<{ run: Polyline; score: number; length: number }> = [];
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    const length = polylineDistances(run).at(-1) || 0;
    if (length >= 12) eligible.push({ run, length, score: polylineHash(run, index * 0x9e3779b9) });
  }
  eligible.sort((left, right) => left.score - right.score);
  const selected = new Map<Polyline, number>();
  const normalizedPercent = clamp(Number(percent) || 0, 0, 500);
  const cutsPerLine = Math.floor(normalizedPercent / 100);
  const remainder = normalizedPercent % 100;
  const extraCuts = remainder ? Math.max(1, Math.round((eligible.length * remainder) / 100)) : 0;
  for (let index = 0; index < eligible.length; index++) {
    const candidate = eligible[index];
    const requested = cutsPerLine + (index < extraCuts ? 1 : 0);
    const feasible = Math.min(requested, Math.floor(candidate.length / 6));
    if (feasible > 0) selected.set(candidate.run, feasible);
  }
  return selected;
}
