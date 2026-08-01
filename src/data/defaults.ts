import type {
  AbilityScores,
  Campaign,
  CardTemplate,
  CharacterSheetExtra,
  MonsterStats,
  NotificationPrefs,
  PartyVisibility,
  PlayerCharacter,
  SessionSummary,
  UserPreferences,
  UUID,
} from './types';

/** 신규 엔터티 기본값 — 두 어댑터가 동일한 형태를 만들도록 공유한다. */

export const DEFAULT_ABILITIES: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

export const DEFAULT_PARTY_VISIBILITY: PartyVisibility = {
  hp_numbers: true,
  ac: true,
  conditions: true,
  concentration: true,
  class_level: true,
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  in_app: true,
  sound: false,
  browser: false,
  email: false,
};

export function defaultPreferences(userId: UUID): UserPreferences {
  return {
    user_id: userId,
    theme: 'system',
    density: 'default',
    font_scale: 1,
    reduce_motion: false,
    panel_layout: { left: 280, right: 320, leftOpen: true, rightOpen: true },
    notification_prefs: { ...DEFAULT_NOTIFICATION_PREFS },
  };
}

export function defaultCampaignFields(): Pick<
  Campaign,
  'description' | 'system' | 'cover_url' | 'theme_color' | 'status' | 'join_policy' | 'max_players' | 'is_mature' | 'party_visibility' | 'allow_player_notes'
> {
  return {
    description: '',
    system: 'dnd5e',
    cover_url: null,
    theme_color: '#7c3aed',
    status: 'planning',
    join_policy: 'code',
    max_players: 6,
    is_mature: false,
    party_visibility: { ...DEFAULT_PARTY_VISIBILITY },
    allow_player_notes: true,
  };
}

export function defaultMonsterStats(cardId: UUID): MonsterStats {
  return {
    card_id: cardId,
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
    hit_dice: '',
    speeds: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 },
    abilities: { ...DEFAULT_ABILITIES },
    saves: {},
    skills: {},
    vulnerabilities: [],
    resistances: [],
    immunities: [],
    condition_immunities: [],
    senses: '',
    passive_perception: 10,
    languages: '',
    spellcasting_ability: null,
  };
}

export function defaultSheetExtra(): CharacterSheetExtra {
  return {
    attacks: '',
    spells: '',
    equipment: '',
    inventory: '',
    features: '',
    languages: '공용어',
    proficiencies: '',
    notes: '',
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    spell_slots: [],
  };
}

/**
 * 저장된 시트 JSON을 화면이 기대하는 형태로 보정한다.
 *
 * player_characters.sheet의 데이터베이스 기본값은 '{}'이고, 가져오기나 예전 데이터로
 * 일부 항목이 빠질 수 있다. 화면은 spell_slots.map()이나 currency.gp처럼 항목이
 * 항상 있다고 가정하므로, 읽는 시점에 기본값과 병합해 빈 값으로 인한 오류를 막는다.
 */
export function normalizeSheet(value: unknown): CharacterSheetExtra {
  const base = defaultSheetExtra();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return base;
  const raw = value as Partial<CharacterSheetExtra>;

  const text = (input: unknown, fallback: string): string => (typeof input === 'string' ? input : fallback);
  const coin = (input: unknown): number => (typeof input === 'number' && Number.isFinite(input) ? input : 0);

  const currency =
    typeof raw.currency === 'object' && raw.currency !== null
      ? (raw.currency as Record<string, unknown>)
      : {};

  const slots = Array.isArray(raw.spell_slots)
    ? raw.spell_slots
        .filter((slot): slot is { level: number; current: number; max: number } =>
          typeof slot === 'object' && slot !== null && typeof (slot as { level?: unknown }).level === 'number')
        .map((slot) => {
          const max = typeof slot.max === 'number' ? Math.max(0, Math.trunc(slot.max)) : 0;
          const current = typeof slot.current === 'number' ? Math.max(0, Math.trunc(slot.current)) : 0;
          // 남은 칸이 전체 칸보다 많을 수는 없다. 칸 수를 줄인 뒤 저장된 값이 그럴 수 있다.
          return { level: Math.min(9, Math.max(1, Math.trunc(slot.level))), max, current: Math.min(current, max) };
        })
        .sort((a, b) => a.level - b.level)
    : base.spell_slots;

  return {
    attacks: text(raw.attacks, base.attacks),
    spells: text(raw.spells, base.spells),
    equipment: text(raw.equipment, base.equipment),
    inventory: text(raw.inventory, base.inventory),
    features: text(raw.features, base.features),
    languages: text(raw.languages, base.languages),
    proficiencies: text(raw.proficiencies, base.proficiencies),
    notes: text(raw.notes, base.notes),
    currency: {
      pp: coin(currency.pp),
      gp: coin(currency.gp),
      ep: coin(currency.ep),
      sp: coin(currency.sp),
      cp: coin(currency.cp),
    },
    spell_slots: slots,
  };
}

/**
 * 저장소에서 읽은 캐릭터를 화면이 안전하게 쓸 수 있는 형태로 보정한다.
 * 반환 타입에서 sheet를 CharacterSheetExtra로 좁혀, 호출한 쪽이 항목 존재를 보장받게 한다.
 */
export function normalizeCharacter<T extends { sheet?: unknown }>(
  row: T,
): Omit<T, 'sheet'> & { sheet: CharacterSheetExtra } {
  return { ...row, sheet: normalizeSheet(row.sheet) };
}

export function defaultCharacter(campaignId: UUID, userId: UUID, name: string): Omit<PlayerCharacter, 'id' | 'created_at' | 'updated_at'> {
  return {
    campaign_id: campaignId,
    user_id: userId,
    name,
    player_name: '',
    klass: '',
    subclass: '',
    level: 1,
    race: '',
    background: '',
    alignment: '',
    xp: 0,
    image_url: null,
    description: '',
    ac: 10,
    hp: 10,
    max_hp: 10,
    temp_hp: 0,
    speed: 30,
    proficiency_bonus: 2,
    initiative_bonus: 0,
    passive_perception: 10,
    inspiration: false,
    abilities: { ...DEFAULT_ABILITIES },
    saves: {},
    skills: {},
    death_saves: { successes: 0, failures: 0 },
    sheet: defaultSheetExtra(),
    share_settings: { show_hp_numbers: true, show_ac: true, show_conditions: true, show_sheet: false },
    version: 1,
  };
}

export function emptySummary(): SessionSummary {
  return {
    highlights: '',
    npcs: '',
    locations: '',
    loot: '',
    quests_completed: '',
    quests_new: '',
    combat_result: '',
    next_goals: '',
    dm_notes: '',
  };
}

/** 시스템 기본 템플릿 */
export const SYSTEM_TEMPLATES: Omit<CardTemplate, 'campaign_id'>[] = [
  {
    id: 'tpl-monster-basic',
    name: '일반 몬스터',
    card_type: 'monster',
    description: '표준 능력치와 기본 행동 한 개를 가진 몬스터',
    is_system: true,
    payload: {
      summary: '',
      sections: [{ kind: 'action', name: '근접 무기 공격', description: '명중 +4, 사거리 5피트, 목표 하나. 명중 시: 5 (1d6+2) 관통 피해.' }],
    },
  },
  {
    id: 'tpl-monster-boss',
    name: '보스 몬스터',
    card_type: 'monster',
    description: '전설적 행동과 소굴 행동을 포함한 보스',
    is_system: true,
    payload: {
      summary: '',
      sections: [
        { kind: 'trait', name: '전설적 저항 (3회/일)', description: '내성 굴림에 실패하면 대신 성공한 것으로 처리할 수 있다.' },
        { kind: 'action', name: '다중 공격', description: '이 크리처는 두 번 공격한다.' },
        { kind: 'legendary', name: '이동', description: '기회 공격을 유발하지 않고 이동 속도의 절반만큼 이동한다.' },
        { kind: 'lair', name: '소굴 행동', description: '우선권 20 시점(동점 시 패배)에 소굴 효과를 발동한다.' },
      ],
    },
  },
  {
    id: 'tpl-npc',
    name: 'NPC',
    card_type: 'npc',
    description: '이름, 외형, 목적, 비밀을 담은 NPC',
    is_system: true,
    payload: {
      bodyText: '외형:\n말투:\n목적:\n비밀:\n관계:',
      dm_notes: '이 NPC가 파티에게 숨기는 것:',
    },
  },
  {
    id: 'tpl-shop',
    name: '상점',
    card_type: 'location',
    description: '판매 품목과 주인 정보',
    is_system: true,
    payload: { bodyText: '상점 이름:\n주인:\n분위기:\n\n판매 품목\n- \n- ' },
  },
  {
    id: 'tpl-quest',
    name: '퀘스트',
    card_type: 'quest',
    description: '의뢰인, 목표, 보상, 마감',
    is_system: true,
    payload: { bodyText: '의뢰인:\n목표:\n보상:\n마감:\n실패 시 결과:' },
  },
  {
    id: 'tpl-location',
    name: '장소',
    card_type: 'location',
    description: '분위기, 주요 인물, 사건 훅',
    is_system: true,
    payload: { bodyText: '첫인상:\n감각 묘사:\n주요 인물:\n사건 훅:' },
  },
  {
    id: 'tpl-magic-item',
    name: '마법 아이템',
    card_type: 'item',
    description: '희귀도, 조율, 효과',
    is_system: true,
    payload: { bodyText: '희귀도:\n조율 필요 여부:\n효과:\n저주:' },
  },
  {
    id: 'tpl-handout',
    name: '일반 핸드아웃',
    card_type: 'handout',
    description: '플레이어에게 보여줄 문서',
    is_system: true,
    payload: { bodyText: '' },
  },
  {
    id: 'tpl-trap',
    name: '함정',
    card_type: 'rule',
    description: '발동 조건, 탐지 DC, 피해',
    is_system: true,
    payload: { bodyText: '발동 조건:\n탐지 DC:\n해제 DC:\n피해:\n재설정:' },
  },
  {
    id: 'tpl-puzzle',
    name: '퍼즐',
    card_type: 'rule',
    description: '단서, 해답, 힌트',
    is_system: true,
    payload: { bodyText: '제시되는 것:\n단서:\n해답:\n힌트 1:\n힌트 2:' },
  },
];
