import type { AbilityKey, AbilityScores } from '@/data/types';

/** D&D 5e 능력치 수정치: floor((점수 - 10) / 2) */
export function abilityModifier(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.floor((score - 10) / 2);
}

/** +3 / -1 처럼 부호를 항상 표시한다. */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function modifiersOf(abilities: AbilityScores): Record<AbilityKey, number> {
  return {
    str: abilityModifier(abilities.str),
    dex: abilityModifier(abilities.dex),
    con: abilityModifier(abilities.con),
    int: abilityModifier(abilities.int),
    wis: abilityModifier(abilities.wis),
    cha: abilityModifier(abilities.cha),
  };
}

/** 캐릭터 레벨에 따른 숙련 보너스 (1~20레벨) */
export function proficiencyBonusForLevel(level: number): number {
  const clamped = Math.min(20, Math.max(1, Math.floor(level || 1)));
  return 2 + Math.floor((clamped - 1) / 4);
}

/** 도전 등급 문자열("1/4", "7")을 숫자로 변환 */
export function parseChallengeRating(cr: string): number {
  const trimmed = (cr ?? '').trim();
  if (trimmed.includes('/')) {
    const [num, den] = trimmed.split('/');
    const n = Number(num);
    const d = Number(den);
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) return n / d;
    return 0;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 0;
}

/** 도전 등급에 따른 숙련 보너스 (DMG 기준) */
export function proficiencyBonusForCR(cr: string): number {
  const value = parseChallengeRating(cr);
  if (value < 5) return 2;
  return 2 + Math.floor((Math.ceil(value) - 1) / 4);
}

/** 수동 지각 = 10 + 지혜 수정치 (+ 숙련) */
export function passivePerception(wisdom: number, proficient = false, proficiencyBonus = 0): number {
  return 10 + abilityModifier(wisdom) + (proficient ? proficiencyBonus : 0);
}

export const SKILL_LIST: { key: string; label: string; ability: AbilityKey }[] = [
  { key: 'acrobatics', label: '곡예', ability: 'dex' },
  { key: 'animal_handling', label: '동물 조련', ability: 'wis' },
  { key: 'arcana', label: '비전학', ability: 'int' },
  { key: 'athletics', label: '운동', ability: 'str' },
  { key: 'deception', label: '기만', ability: 'cha' },
  { key: 'history', label: '역사학', ability: 'int' },
  { key: 'insight', label: '통찰', ability: 'wis' },
  { key: 'intimidation', label: '위협', ability: 'cha' },
  { key: 'investigation', label: '수사', ability: 'int' },
  { key: 'medicine', label: '의학', ability: 'wis' },
  { key: 'nature', label: '자연학', ability: 'int' },
  { key: 'perception', label: '감지', ability: 'wis' },
  { key: 'performance', label: '공연', ability: 'cha' },
  { key: 'persuasion', label: '설득', ability: 'cha' },
  { key: 'religion', label: '종교학', ability: 'int' },
  { key: 'sleight_of_hand', label: '손재주', ability: 'dex' },
  { key: 'stealth', label: '은신', ability: 'dex' },
  { key: 'survival', label: '생존', ability: 'wis' },
];
