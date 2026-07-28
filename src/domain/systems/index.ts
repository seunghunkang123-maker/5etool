import type { AbilityKey, MonsterStats } from '@/data/types';
import { abilityModifier, proficiencyBonusForCR, proficiencyBonusForLevel, SKILL_LIST } from '../abilities';
import { concentrationDC } from '../concentration';
import { DND5E_CONDITIONS, type ConditionTemplate } from '../conditions';

/**
 * 규칙 시스템 모듈.
 * 다른 TRPG를 추가할 때 이 인터페이스를 구현해 등록하면 된다.
 */
export interface SystemModule {
  id: string;
  name: string;
  /** 능력치 키 목록 */
  abilityKeys: AbilityKey[];
  /** 능력치 → 수정치 */
  abilityModifier(score: number): number;
  /** 캐릭터 레벨 → 숙련 보너스 */
  proficiencyForLevel(level: number): number;
  /** 도전 등급 → 숙련 보너스 */
  proficiencyForCR(cr: string): number;
  /** 집중 내성 난이도 */
  concentrationDC(damage: number): number;
  /** 기본 상태 효과 목록 */
  conditions: ConditionTemplate[];
  /** 기술 목록 */
  skills: { key: string; label: string; ability: AbilityKey }[];
  /** 이니셔티브 보너스 계산 */
  initiativeBonus(abilities: Record<AbilityKey, number>, extra?: number): number;
  /** 몬스터 기본값 */
  defaultMonsterStats(): Omit<MonsterStats, 'card_id'>;
}

export const dnd5e: SystemModule = {
  id: 'dnd5e',
  name: 'D&D 5판',
  abilityKeys: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
  abilityModifier,
  proficiencyForLevel: proficiencyBonusForLevel,
  proficiencyForCR: proficiencyBonusForCR,
  concentrationDC,
  conditions: DND5E_CONDITIONS,
  skills: SKILL_LIST,
  initiativeBonus: (abilities, extra = 0) => abilityModifier(abilities.dex) + extra,
  defaultMonsterStats: () => ({
    size: '중형',
    type: '괴물류',
    alignment: '중립',
    cr: '1',
    proficiency_bonus: 2,
    xp: 200,
    ac: 12,
    ac_note: '',
    hp: 11,
    max_hp: 11,
    temp_hp: 0,
    hit_dice: '2d8+2',
    speeds: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: {},
    skills: {},
    vulnerabilities: [],
    resistances: [],
    immunities: [],
    condition_immunities: [],
    senses: '',
    passive_perception: 10,
    languages: '공용어',
    spellcasting_ability: null,
  }),
};

/** 범용(무규칙) 시스템 — D&D가 아닌 캠페인용 최소 구현 */
export const generic: SystemModule = {
  ...dnd5e,
  id: 'generic',
  name: '범용 시스템',
  conditions: DND5E_CONDITIONS.slice(0, 4),
};

export const SYSTEM_REGISTRY: Record<string, SystemModule> = {
  dnd5e,
  generic,
};

export const SYSTEM_OPTIONS = [
  { value: 'dnd5e', label: 'D&D 5판' },
  { value: 'pf2e', label: 'Pathfinder 2판 (범용 규칙으로 동작)' },
  { value: 'coc7', label: '크툴루의 부름 7판 (범용 규칙으로 동작)' },
  { value: 'generic', label: '기타 / 범용' },
];

export function getSystem(id: string | undefined | null): SystemModule {
  return SYSTEM_REGISTRY[id ?? 'dnd5e'] ?? dnd5e;
}
