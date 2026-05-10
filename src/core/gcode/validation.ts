import { MachineProfile } from '../../types';

type ParsedWord = {
  letter: string;
  value: number;
  raw: string;
};

const WORD_PATTERN = /^([A-Z])(-?\d+(?:\.\d+)?)$/;
const SETTING_PATTERN = /^\$([A-Z0-9]+)=(-?\d+(?:\.\d+)?)$/i;

function normalizeCommandWord(word: ParsedWord): string {
  return `${word.letter}${Number(word.value)}`;
}

function parseWords(line: string): ParsedWord[] {
  return line.split(/\s+/).map((token) => {
    const match = token.match(WORD_PATTERN);
    if (!match) {
      throw new Error(`unsupported token "${token}"`);
    }

    const value = Number(match[2]);
    if (!Number.isFinite(value)) {
      throw new Error(`invalid numeric token "${token}"`);
    }

    return {
      letter: match[1].toUpperCase(),
      value,
      raw: token
    };
  });
}

function assertNoDuplicateWords(words: ParsedWord[]): void {
  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word.letter)) {
      throw new Error(`duplicate ${word.letter} word`);
    }
    seen.add(word.letter);
  }
}

function assertAllowedLetters(words: ParsedWord[], allowed: string[]): void {
  const allowedSet = new Set(allowed);
  for (const word of words) {
    if (!allowedSet.has(word.letter)) {
      throw new Error(`${word.letter} word is not allowed for ${normalizeCommandWord(words[0])}`);
    }
  }
}

function assertPositiveFeed(words: ParsedWord[]): void {
  const feed = words.find((word) => word.letter === 'F');
  if (feed && feed.value <= 0) {
    throw new Error('feed rate must be greater than zero');
  }
}

function assertAxisBounds(words: ParsedWord[], profile: MachineProfile): void {
  const x = words.find((word) => word.letter === 'X');
  const y = words.find((word) => word.letter === 'Y');
  const z = words.find((word) => word.letter === 'Z');

  if (x && (x.value < 0 || x.value > profile.workArea.x)) {
    throw new Error(`X ${x.value} exceeds safe range [0, ${profile.workArea.x}]`);
  }

  const minY = profile.origin === 'top-left' ? -profile.workArea.y : 0;
  const maxY = profile.origin === 'top-left' ? 0 : profile.workArea.y;
  if (y && (y.value < minY || y.value > maxY)) {
    throw new Error(`Y ${y.value} exceeds safe range [${minY}, ${maxY}]`);
  }

  if (z) {
    const maxZ = profile.workArea.z ?? Math.max(profile.penUpValue ?? 0, profile.penDownValue ?? 0, 0);
    if (z.value < 0 || z.value > maxZ) {
      throw new Error(`Z ${z.value} exceeds safe range [0, ${maxZ}]`);
    }
  }
}

function validateG0G1(words: ParsedWord[], profile: MachineProfile): void {
  assertAllowedLetters(words, ['G', 'X', 'Y', 'Z', 'F']);
  assertNoDuplicateWords(words);
  assertPositiveFeed(words);
  assertAxisBounds(words, profile);

  if (!words.some((word) => ['X', 'Y', 'Z'].includes(word.letter))) {
    throw new Error(`${normalizeCommandWord(words[0])} requires at least one axis word`);
  }
}

function validateG10(words: ParsedWord[], profile: MachineProfile): void {
  assertAllowedLetters(words, ['G', 'L', 'P', 'X', 'Y', 'Z']);
  assertNoDuplicateWords(words);

  const l = words.find((word) => word.letter === 'L');
  const p = words.find((word) => word.letter === 'P');
  if (!l || l.value !== 2 || !p || p.value !== 1) {
    throw new Error('only G10 L2 P1 work-coordinate offsets are allowed');
  }

  assertAxisBounds(words, profile);
}

function validateModalCommand(words: ParsedWord[]): void {
  if (words.length !== 1) {
    throw new Error(`${normalizeCommandWord(words[0])} does not accept extra words`);
  }
}

function validateDollarSetting(line: string): void {
  const match = line.match(SETTING_PATTERN);
  if (!match) {
    throw new Error('$ commands must be explicit setting assignments');
  }

  const setting = match[1].toUpperCase();
  const value = Number(match[2]);
  if (setting !== '1' || ![250, 255].includes(value)) {
    throw new Error(`$${setting}=${value} is not allowed in streamed jobs`);
  }
}

function hasControlCharacter(line: string): boolean {
  return Array.from(line).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function validateGCodeLine(line: string, profile: MachineProfile): void {
  if (line !== line.trim()) {
    throw new Error('line has leading or trailing whitespace');
  }
  if (line.length === 0) {
    throw new Error('blank lines are not allowed');
  }
  if (hasControlCharacter(line)) {
    throw new Error('control characters are not allowed');
  }
  if (/[;()]/.test(line)) {
    throw new Error('comments are not allowed in streamed jobs');
  }
  if (line.startsWith('$')) {
    validateDollarSetting(line);
    return;
  }

  const words = parseWords(line);
  const command = normalizeCommandWord(words[0]);
  if (words[0].letter !== 'G' && words[0].letter !== 'M') {
    throw new Error('line must start with an allowed G-code or M-code');
  }

  switch (command) {
    case 'G0':
    case 'G1':
      validateG0G1(words, profile);
      return;
    case 'G10':
      validateG10(words, profile);
      return;
    case 'G20':
    case 'G21':
    case 'G90':
    case 'G91':
    case 'M5':
      validateModalCommand(words);
      return;
    default:
      throw new Error(`${command} is not allowed in streamed jobs`);
  }
}

export function validateGCodeJob(gcode: string[], profile: MachineProfile): void {
  if (!Array.isArray(gcode) || gcode.length === 0) {
    throw new Error('Generated job has no G-code lines');
  }

  gcode.forEach((line, index) => {
    if (typeof line !== 'string') {
      throw new Error(`Generated job line ${index + 1} is not a string`);
    }

    try {
      validateGCodeLine(line, profile);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unsafe G-code rejected at line ${index + 1}: ${detail}`);
    }
  });
}
