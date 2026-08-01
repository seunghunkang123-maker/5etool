import { PROFICIENCY_LEVELS, type ProficiencyEntry, type ProficiencyLevel, type StoredProficiency } from '@/data/types';

/**
 * 내성 굴림·기술 숙련 계산.
 *
 * D&D 5e에서 클래스마다 숙련 보너스가 붙는 방식이 다르다.
 *  - 숙련        : +숙련 보너스
 *  - 전문성      : +숙련 보너스 × 2   (도적·바드)
 *  - 재주꾼(절반): +숙련 보너스 ÷ 2 내림 (바드)
 * 여기에 마법 물품 같은 고정 보정치를 따로 더할 수 있게 했다.
 */

function isLevel(value: unknown): value is ProficiencyLevel {
  return PROFICIENCY_LEVELS.includes(value as ProficiencyLevel);
}

/** 저장된 값을 항상 같은 형태로 읽는다. 구버전의 참/거짓도 받아 준다. */
export function toProficiency(stored: StoredProficiency): ProficiencyEntry {
  if (stored === true) return { level: 'proficient', bonus: 0 };
  if (!stored || typeof stored !== 'object') return { level: 'none', bonus: 0 };

  const level = isLevel(stored.level) ? stored.level : 'none';
  const raw = typeof stored.bonus === 'number' ? stored.bonus : Number(stored.bonus);
  const bonus = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  return { level, bonus: Math.min(99, Math.max(-99, bonus)) };
}

/** 숙련 단계가 더해 주는 값. */
export function proficiencyShare(level: ProficiencyLevel, proficiencyBonus: number): number {
  switch (level) {
    case 'expertise':
      return proficiencyBonus * 2;
    case 'proficient':
      return proficiencyBonus;
    case 'half':
      return Math.floor(proficiencyBonus / 2);
    default:
      return 0;
  }
}

/** 최종 수정치 = 능력 수정치 + 숙련 몫 + 고정 보정치 */
export function proficiencyTotal(abilityMod: number, proficiencyBonus: number, stored: StoredProficiency): number {
  const entry = toProficiency(stored);
  return abilityMod + proficiencyShare(entry.level, proficiencyBonus) + entry.bonus;
}

/**
 * 저장할 값을 만든다.
 * 아무 것도 없는 상태(숙련 없음 + 보정 0)는 값을 지워 두어 저장 용량을 줄인다.
 */
export function fromProficiency(entry: ProficiencyEntry): Partial<ProficiencyEntry> | undefined {
  if (entry.level === 'none' && entry.bonus === 0) return undefined;
  return entry.bonus === 0 ? { level: entry.level } : { level: entry.level, bonus: entry.bonus };
}

/** 목록에서 값을 바꾼 새 객체를 만든다. undefined면 항목을 지운다. */
export function withProficiency<K extends string>(
  map: Partial<Record<K, StoredProficiency>>,
  key: K,
  entry: ProficiencyEntry,
): Partial<Record<K, StoredProficiency>> {
  const next = { ...map };
  const stored = fromProficiency(entry);
  if (stored === undefined) delete next[key];
  else next[key] = stored;
  return next;
}
