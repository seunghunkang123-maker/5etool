import type { DieGroupResult, RollDetail } from '@/data/types';

/**
 * 주사위 식 해석 및 굴림.
 * 지원: d20, 2d6, 1d20+5, 4d6-2, 2d20kh1, 2d20kl1, 1d8+1d6+3
 */

export const MAX_DICE_COUNT = 100;
export const MAX_DIE_SIDES = 1000;
export const MAX_EXPRESSION_LENGTH = 100;

export interface ParsedTerm {
  kind: 'dice' | 'modifier';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'kh' | 'kl'; n: number };
  value: number;
}

export class DiceParseError extends Error {
  override readonly name = 'DiceParseError';
}

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d*))?$/i;

/**
 * 식을 항으로 분해한다. 잘못된 식이면 DiceParseError를 던진다.
 */
export function parseExpression(input: string): ParsedTerm[] {
  const raw = (input ?? '').trim();
  if (!raw) throw new DiceParseError('주사위 식을 입력해 주세요.');
  if (raw.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceParseError(`주사위 식은 ${MAX_EXPRESSION_LENGTH}자를 넘을 수 없습니다.`);
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  if (!/^[0-9dkhl+-]+$/.test(normalized)) {
    throw new DiceParseError('주사위 식에 사용할 수 없는 문자가 있습니다. 예: 2d6+3');
  }

  // 부호를 유지하면서 항으로 분리
  const tokens = normalized.match(/[+-]?[^+-]+/g);
  if (!tokens || tokens.length === 0) throw new DiceParseError('주사위 식을 해석할 수 없습니다.');

  const terms: ParsedTerm[] = [];
  for (const token of tokens) {
    let sign: 1 | -1 = 1;
    let body = token;
    if (body.startsWith('+')) body = body.slice(1);
    else if (body.startsWith('-')) {
      sign = -1;
      body = body.slice(1);
    }
    if (!body) throw new DiceParseError('주사위 식을 해석할 수 없습니다.');

    if (body.includes('d')) {
      const match = TERM_RE.exec(body);
      if (!match) throw new DiceParseError(`"${token}" 부분을 해석할 수 없습니다. 예: 2d20kh1`);
      const count = match[1] === '' ? 1 : Number(match[1]);
      const sides = Number(match[2]);
      if (!Number.isInteger(count) || count < 1 || count > MAX_DICE_COUNT) {
        throw new DiceParseError(`주사위 개수는 1~${MAX_DICE_COUNT}개여야 합니다.`);
      }
      if (!Number.isInteger(sides) || sides < 2 || sides > MAX_DIE_SIDES) {
        throw new DiceParseError(`주사위 면수는 2~${MAX_DIE_SIDES}이어야 합니다.`);
      }
      const term: ParsedTerm = { kind: 'dice', sign, count, sides, value: 0 };
      if (match[3]) {
        const n = match[4] === '' || match[4] === undefined ? 1 : Number(match[4]);
        if (!Number.isInteger(n) || n < 1 || n > count) {
          throw new DiceParseError('kh/kl 뒤의 숫자는 주사위 개수 이하이어야 합니다.');
        }
        term.keep = { mode: match[3] as 'kh' | 'kl', n };
      }
      terms.push(term);
    } else {
      const value = Number(body);
      if (!Number.isInteger(value)) throw new DiceParseError(`"${token}" 부분을 해석할 수 없습니다.`);
      terms.push({ kind: 'modifier', sign, count: 0, sides: 0, value });
    }
  }
  return terms;
}

export type RandomFn = (sides: number) => number;

export const defaultRandom: RandomFn = (sides) => {
  // 브라우저/Node 모두에서 사용 가능한 암호학적 난수를 우선 사용한다.
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    // 모듈로 편향을 제거한다.
    const limit = Math.floor(0xffffffff / sides) * sides;
    let value = 0;
    do {
      cryptoObj.getRandomValues(buf);
      value = buf[0] ?? 0;
    } while (value >= limit);
    return (value % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
};

export interface RollResult {
  expression: string;
  detail: RollDetail;
  total: number;
}

/** 식을 굴려 결과를 반환한다. random을 주입해 테스트에서 결정적으로 만들 수 있다. */
export function rollExpression(input: string, random: RandomFn = defaultRandom): RollResult {
  const terms = parseExpression(input);
  const groups: DieGroupResult[] = [];
  let modifier = 0;
  let total = 0;

  for (const term of terms) {
    if (term.kind === 'modifier') {
      modifier += term.sign * term.value;
      total += term.sign * term.value;
      continue;
    }
    const rolls: number[] = [];
    for (let i = 0; i < term.count; i += 1) rolls.push(random(term.sides));

    let kept = rolls;
    if (term.keep) {
      const sorted = [...rolls].sort((a, b) => (term.keep?.mode === 'kh' ? b - a : a - b));
      kept = sorted.slice(0, term.keep.n);
    }
    const subtotal = kept.reduce((sum, n) => sum + n, 0);
    total += term.sign * subtotal;

    const group: DieGroupResult = {
      count: term.count,
      sides: term.sides,
      rolls,
      kept,
      sign: term.sign,
    };
    if (term.keep) group.keep = term.keep;
    groups.push(group);
  }

  return { expression: input.trim(), detail: { groups, modifier }, total };
}

/** "2d6[3,5] +2 = 10" 형태의 사람이 읽는 요약 */
export function formatRollDetail(detail: RollDetail): string {
  const parts = detail.groups.map((g) => {
    const sign = g.sign === -1 ? '-' : '';
    const keepNote = g.keep ? `${g.keep.mode}${g.keep.n}` : '';
    const dropped = g.rolls.length !== g.kept.length;
    const rollText = dropped
      ? `[${g.rolls.join(', ')} → ${g.kept.join(', ')}]`
      : `[${g.rolls.join(', ')}]`;
    return `${sign}${g.count}d${g.sides}${keepNote}${rollText}`;
  });
  if (detail.modifier !== 0) {
    parts.push(detail.modifier > 0 ? `+${detail.modifier}` : `${detail.modifier}`);
  }
  return parts.join(' ');
}

/** 자연 20 / 자연 1 판정 (단일 d20 굴림에 한해 의미가 있다) */
export function criticalKind(detail: RollDetail): 'crit' | 'fumble' | null {
  const d20s = detail.groups.filter((g) => g.sides === 20);
  if (d20s.length !== 1) return null;
  const group = d20s[0];
  if (!group || group.kept.length !== 1) return null;
  const value = group.kept[0];
  if (value === 20) return 'crit';
  if (value === 1) return 'fumble';
  return null;
}
