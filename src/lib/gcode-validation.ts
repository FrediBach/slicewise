export type GCodeIssue = {
  code: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
};

export type GCodePathSegment = {
  from: readonly [number, number];
  kind: 'draw' | 'travel';
  line: number;
  to: readonly [number, number];
};

export type GCodeValidationOptions = {
  width: number;
  height: number;
  penUp: number;
  penDown: number;
  drawFeed: number;
  travelFeed: number;
  zFeed: number;
  machineWidth?: number;
  machineHeight?: number;
  minimumDrawSegment?: number;
};

export type GCodeValidationResult = {
  errors: GCodeIssue[];
  issues: GCodeIssue[];
  segments: GCodePathSegment[];
  stats: {
    drawDistance: number;
    estimatedSeconds: number;
    penChanges: number;
    penLifts: number;
    programLines: number;
    travelDistance: number;
  };
  valid: boolean;
  warnings: GCodeIssue[];
};

type ParsedLine = {
  command: { letter: 'G' | 'M'; value: number };
  words: Map<string, number>;
};

const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const WORD = new RegExp(`\\s*([A-Za-z])(${NUMBER})`, 'y');
const EPSILON = 0.0005;
const MOTION_WORDS = new Set(['X', 'Y', 'Z', 'F']);

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function parseLine(source: string): ParsedLine | string | null {
  const code = source.split(';', 1)[0].trim();
  if (!code) return null;
  const parsed: Array<readonly [string, number]> = [];
  let cursor = 0;
  while (cursor < code.length) {
    WORD.lastIndex = cursor;
    const match = WORD.exec(code);
    if (!match) return `Cannot parse “${code.slice(cursor).trim()}”.`;
    const value = Number(match[2]);
    if (!Number.isFinite(value)) return `Non-finite ${match[1].toUpperCase()} value.`;
    parsed.push([match[1].toUpperCase(), value]);
    cursor = WORD.lastIndex;
  }
  if (!parsed.length || (parsed[0][0] !== 'G' && parsed[0][0] !== 'M'))
    return 'Each program line must begin with a G or M command.';
  const command = parsed[0] as readonly ['G' | 'M', number];
  const words = new Map<string, number>();
  for (const [letter, value] of parsed.slice(1)) {
    if (letter === 'G' || letter === 'M') return 'Only one command is allowed per line.';
    if (words.has(letter)) return `Duplicate ${letter} word.`;
    words.set(letter, value);
  }
  return { command: { letter: command[0], value: command[1] }, words };
}

function unexpectedWord(words: Map<string, number>): string | null {
  for (const letter of words.keys()) if (!MOTION_WORDS.has(letter)) return letter;
  return null;
}

/**
 * Strictly simulate the small G-code dialect emitted by Slicewise.
 * This is deliberately a machine-profile validator, not a permissive general G-code parser.
 */
export function validateGCode(
  gcode: string,
  options: GCodeValidationOptions,
): GCodeValidationResult {
  const issues: GCodeIssue[] = [];
  const segments: GCodePathSegment[] = [];
  const minimumDrawSegment = options.minimumDrawSegment ?? 0.05;
  let x = 0;
  let y = 0;
  let z: number | null = null;
  let pen: 'down' | 'unknown' | 'up' = 'unknown';
  let unitsSet = false;
  let absoluteSet = false;
  let feedModeSet = false;
  let ended = false;
  let motionSeen = false;
  let drawDistance = 0;
  let travelDistance = 0;
  let estimatedSeconds = 0;
  let penChanges = 0;
  let penLifts = 0;
  let programLines = 0;

  const addIssue = (
    severity: GCodeIssue['severity'],
    code: string,
    line: number,
    message: string,
  ) => issues.push({ severity, code, line, message });
  if (
    options.machineWidth !== undefined &&
    options.machineHeight !== undefined &&
    (options.width > options.machineWidth + EPSILON ||
      options.height > options.machineHeight + EPSILON)
  )
    addIssue(
      'error',
      'machine-area-exceeded',
      0,
      `The ${options.width} × ${options.height} mm artboard exceeds this machine’s ${options.machineWidth} × ${options.machineHeight} mm working area.`,
    );
  const requireSetup = (line: number) => {
    if (!unitsSet || !absoluteSet || !feedModeSet)
      addIssue(
        'error',
        'setup-incomplete',
        line,
        'G21, G90, and G94 must be established before motion.',
      );
  };

  for (const [index, source] of gcode.split(/\r?\n/).entries()) {
    const line = index + 1;
    const parsed = parseLine(source);
    if (parsed === null) continue;
    programLines += 1;
    if (typeof parsed === 'string') {
      addIssue('error', 'syntax', line, parsed);
      continue;
    }
    if (ended) {
      addIssue('error', 'command-after-end', line, 'No command may follow M2.');
      continue;
    }
    const { command, words } = parsed;
    if (!Number.isInteger(command.value)) {
      addIssue('error', 'unsupported-command', line, 'Command numbers must be integers.');
      continue;
    }
    const name = `${command.letter}${command.value}`;

    if (name === 'G21' || name === 'G90' || name === 'G94') {
      if (words.size) addIssue('error', 'unexpected-word', line, `${name} takes no parameters.`);
      if (motionSeen)
        addIssue('error', 'late-setup', line, `${name} must appear before the first motion.`);
      if (name === 'G21') unitsSet = true;
      else if (name === 'G90') absoluteSet = true;
      else feedModeSet = true;
      continue;
    }

    if (name === 'M0') {
      if (words.size) addIssue('error', 'unexpected-word', line, 'M0 takes no parameters.');
      if (pen !== 'up')
        addIssue('error', 'unsafe-pen-change', line, 'The pen must be up before a pen change.');
      penChanges += 1;
      continue;
    }

    if (name === 'M2') {
      if (words.size) addIssue('error', 'unexpected-word', line, 'M2 takes no parameters.');
      if (pen !== 'up')
        addIssue('error', 'unsafe-end', line, 'The program must end with the pen up.');
      if (!approximatelyEqual(x, 0) || !approximatelyEqual(y, 0))
        addIssue('error', 'not-homed', line, 'The program must return to X0 Y0 before M2.');
      ended = true;
      continue;
    }

    if (name !== 'G0' && name !== 'G1') {
      addIssue('error', 'unsupported-command', line, `${name} is not allowed by this profile.`);
      continue;
    }

    motionSeen = true;
    requireSetup(line);
    const unexpected = unexpectedWord(words);
    if (unexpected)
      addIssue('error', 'unexpected-word', line, `${unexpected} is not allowed on ${name}.`);
    const hasX = words.has('X');
    const hasY = words.has('Y');
    const hasZ = words.has('Z');
    const feed = words.get('F');
    if (feed === undefined || feed <= 0)
      addIssue('error', 'missing-feed', line, 'Every motion must include a positive feed rate.');
    if (hasZ && (hasX || hasY))
      addIssue('error', 'mixed-axis-motion', line, 'XY and Z motion must use separate lines.');

    if (hasZ) {
      if (name !== 'G1') addIssue('error', 'unsafe-z-motion', line, 'Pen Z motion must use G1.');
      if (hasX || hasY || words.size !== 2)
        addIssue('error', 'invalid-z-motion', line, 'A pen move must contain only Z and F.');
      if (feed !== undefined && !approximatelyEqual(feed, options.zFeed))
        addIssue('error', 'wrong-feed', line, `Expected Z feed ${options.zFeed} mm/min.`);
      const nextZ = words.get('Z')!;
      const previousPen = pen;
      if (approximatelyEqual(nextZ, options.penUp)) pen = 'up';
      else if (approximatelyEqual(nextZ, options.penDown)) pen = 'down';
      else {
        pen = 'unknown';
        addIssue(
          'error',
          'unknown-pen-height',
          line,
          `Z${nextZ} is neither the configured pen-up nor pen-down height.`,
        );
      }
      if (previousPen === 'down' && pen === 'up') penLifts += 1;
      if (z !== null && feed && feed > 0) estimatedSeconds += (Math.abs(nextZ - z) / feed) * 60;
      z = nextZ;
      continue;
    }

    if (!hasX || !hasY || words.size !== 3) {
      addIssue('error', 'invalid-xy-motion', line, 'An XY move must contain X, Y, and F.');
      continue;
    }
    const nextX = words.get('X')!;
    const nextY = words.get('Y')!;
    if (nextX < -EPSILON || nextX > options.width + EPSILON)
      addIssue('error', 'x-out-of-bounds', line, `X${nextX} is outside 0–${options.width} mm.`);
    if (nextY < -EPSILON || nextY > options.height + EPSILON)
      addIssue('error', 'y-out-of-bounds', line, `Y${nextY} is outside 0–${options.height} mm.`);
    const distance = Math.hypot(nextX - x, nextY - y);
    const kind = name === 'G0' ? 'travel' : 'draw';
    const expectedFeed = kind === 'travel' ? options.travelFeed : options.drawFeed;
    if (feed !== undefined && !approximatelyEqual(feed, expectedFeed))
      addIssue('error', 'wrong-feed', line, `Expected ${kind} feed ${expectedFeed} mm/min.`);
    if (kind === 'travel' && pen !== 'up')
      addIssue('error', 'unsafe-rapid', line, 'Rapid travel is only allowed with the pen up.');
    if (kind === 'draw' && pen !== 'down')
      addIssue('error', 'pen-not-down', line, 'Drawing motion requires the pen to be down.');
    if (kind === 'draw' && distance > EPSILON && distance < minimumDrawSegment)
      addIssue(
        'warning',
        'tiny-draw-segment',
        line,
        `Draw segment is only ${distance.toFixed(3)} mm long.`,
      );
    if (distance > EPSILON) {
      segments.push({ from: [x, y], to: [nextX, nextY], kind, line });
      if (kind === 'travel') travelDistance += distance;
      else drawDistance += distance;
      if (feed && feed > 0) estimatedSeconds += (distance / feed) * 60;
    }
    x = nextX;
    y = nextY;
  }

  if (!ended)
    addIssue('error', 'missing-end', Math.max(1, gcode.split(/\r?\n/).length), 'Missing M2.');
  if (!segments.some(({ kind }) => kind === 'draw'))
    addIssue('warning', 'empty-drawing', 0, 'The program contains no pen-down drawing moves.');

  const errors = issues.filter(({ severity }) => severity === 'error');
  const warnings = issues.filter(({ severity }) => severity === 'warning');
  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
    segments,
    stats: {
      drawDistance,
      travelDistance,
      penLifts,
      penChanges,
      programLines,
      estimatedSeconds,
    },
  };
}
