import type { CombatantInput } from '@/data/repository';
import type { UUID } from '@/data/types';

/**
 * 전투 참가자 입력값 정리.
 *
 * 화면의 숫자 칸은 비우면 빈 문자열이 되고, 붙여넣기나 오래된 카드 자료에는
 * HP가 최대 HP보다 큰 값이 남아 있을 수 있다. 그대로 보내면 데이터베이스의
 * `hp <= max_hp` 제약이나 not-null 제약에 걸려 추가가 통째로 실패한다.
 *
 * 두 저장소 어댑터(Supabase·데모)가 같은 규칙을 쓰도록 이 함수 한 곳에 모았다.
 * 여기서는 절대 예외를 던지지 않는다. 이상한 값이 와도 쓸 수 있는 값으로 맞춘다.
 */

/** 참가자 수 상한. 한 번에 너무 많이 넣어 화면이 멈추지 않게 한다. */
export const MAX_COMBATANT_COUNT = 20;
/** HP 상한. 실수로 자릿수를 잘못 넣어도 정수 범위를 벗어나지 않게 한다. */
export const MAX_COMBATANT_HP = 100_000;

export interface NormalizedCombatant {
  source_type: CombatantInput['source_type'];
  source_card_id: UUID | null;
  character_id: UUID | null;
  name: string;
  image_url: string | null;
  initiative: number | null;
  dex_score: number;
  dex_mod: number;
  hp: number;
  max_hp: number;
  ac: number;
  is_hidden: boolean;
  hide_hp_numbers: boolean;
  dm_notes: string;
  /** 만들 참가자 수(1 이상 MAX_COMBATANT_COUNT 이하). */
  count: number;
}

/** 숫자가 아니면(NaN·Infinity·null·문자열) 기본값을 쓰고, 정수로 잘라 범위 안에 넣는다. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(num)));
}

/** 능력치 수정치. 5e 규칙 그대로 (능력치 − 10) ÷ 2를 내림한다. */
export function dexModifierOf(dexScore: number): number {
  return Math.floor((dexScore - 10) / 2);
}

export function normalizeCombatantInput(input: CombatantInput): NormalizedCombatant {
  const name = (input.name ?? '').trim() || '참가자';

  // 최대 HP가 비어 있으면 현재 HP를 최대치로 본다. 둘 다 없으면 1.
  const rawHp = clampInt(input.hp, 0, MAX_COMBATANT_HP, 1);
  const maxHp = clampInt(input.max_hp, 1, MAX_COMBATANT_HP, Math.max(1, rawHp));
  // 카드 자료에 현재 HP가 최대 HP보다 크게 남아 있어도 제약에 걸리지 않게 맞춘다.
  const hp = Math.min(rawHp, maxHp);

  const dexScore = clampInt(input.dex_score, 1, 30, 10);

  return {
    source_type: input.source_type,
    source_card_id: input.source_card_id ?? null,
    character_id: input.character_id ?? null,
    name,
    image_url: input.image_url ?? null,
    initiative:
      input.initiative === null || input.initiative === undefined ? null : clampInt(input.initiative, -999, 999, 0),
    dex_score: dexScore,
    dex_mod: dexModifierOf(dexScore),
    hp,
    max_hp: maxHp,
    ac: clampInt(input.ac, 0, 99, 10),
    is_hidden: input.is_hidden ?? false,
    hide_hp_numbers: input.hide_hp_numbers ?? input.source_type !== 'pc',
    dm_notes: input.dm_notes ?? '',
    count: clampInt(input.count, 1, MAX_COMBATANT_COUNT, 1),
  };
}
