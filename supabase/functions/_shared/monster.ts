/**
 * AI 몬스터 생성용 입출력 스키마.
 *
 * 프론트엔드(src/domain/monsterSchema.ts)의 zod 스키마와 같은 형태를 서버에서도 검증한다.
 * 클라이언트 검증은 사용자 편의를 위한 것이고, 여기가 실제 경계다.
 * (Edge Function은 Deno에서 실행되고 프론트엔드 소스를 import할 수 없으므로 의존성 없이 다시 구현한다.)
 */
import { PublicError } from './http.ts';

// ── 요청 입력 ────────────────────────────────────────────────────────

export interface MonsterPromptInput {
  campaign_id: string;
  prompt: string;
  target_cr?: string;
  role?: string;
  size?: string;
  type?: string;
  tactics?: string;
  key_abilities?: string[];
  damage_types?: string[];
  gimmick?: string;
  party_size?: number;
  party_level?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PublicError('요청 형식이 올바르지 않습니다.');
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new PublicError(`${label} 값의 형식이 올바르지 않습니다.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new PublicError(`${label}은(는) ${max}자를 넘을 수 없습니다.`);
  return trimmed || undefined;
}

function optionalList(value: unknown, maxItems: number, maxLen: number, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new PublicError(`${label} 값의 형식이 올바르지 않습니다.`);
  if (value.length > maxItems) throw new PublicError(`${label}은(는) 최대 ${maxItems}개까지 지정할 수 있습니다.`);
  const items = value.map((entry) => {
    if (typeof entry !== 'string') throw new PublicError(`${label} 값의 형식이 올바르지 않습니다.`);
    const trimmed = entry.trim().slice(0, maxLen);
    return trimmed;
  });
  return items.filter(Boolean);
}

function optionalInt(value: unknown, min: number, max: number, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) throw new PublicError(`${label} 값의 형식이 올바르지 않습니다.`);
  const rounded = Math.round(num);
  if (rounded < min || rounded > max) {
    throw new PublicError(`${label}은(는) ${min}에서 ${max} 사이여야 합니다.`);
  }
  return rounded;
}

/** 요청 본문을 검증한다. 길이 제한은 프롬프트 주입/과금 폭주를 막는 1차 방어선이다. */
export function parsePromptInput(body: unknown): MonsterPromptInput {
  const raw = asRecord(body);

  const campaignId = raw.campaign_id;
  if (typeof campaignId !== 'string' || !UUID_RE.test(campaignId)) {
    throw new PublicError('캠페인을 찾을 수 없습니다.');
  }

  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (prompt.length < 5) throw new PublicError('설명을 5자 이상 입력해 주세요.');
  if (prompt.length > 1500) throw new PublicError('설명은 1500자를 넘을 수 없습니다.');

  return {
    campaign_id: campaignId,
    prompt,
    target_cr: optionalText(raw.target_cr, 10, '목표 도전 지수'),
    role: optionalText(raw.role, 60, '역할'),
    size: optionalText(raw.size, 40, '크기'),
    type: optionalText(raw.type, 60, '종류'),
    tactics: optionalText(raw.tactics, 200, '전술'),
    key_abilities: optionalList(raw.key_abilities, 6, 20, '핵심 능력'),
    damage_types: optionalList(raw.damage_types, 8, 30, '피해 유형'),
    gimmick: optionalText(raw.gimmick, 300, '특수 기믹'),
    party_size: optionalInt(raw.party_size, 1, 10, '파티 인원'),
    party_level: optionalInt(raw.party_level, 1, 20, '파티 레벨'),
  };
}

// ── 모델에 요구할 JSON 스키마 ────────────────────────────────────────

const sectionSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '특징 또는 행동 이름 (한국어)' },
    description: { type: 'string', description: '규칙 문장 (한국어)' },
  },
  required: ['name', 'description'],
  additionalProperties: false,
} as const;

const bonusListSchema = (keyName: string, keyDescription: string) =>
  ({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        [keyName]: { type: 'string', description: keyDescription },
        bonus: { type: 'integer', description: '수정치 (예: 5는 +5)' },
      },
      required: [keyName, 'bonus'],
      additionalProperties: false,
    },
  }) as const;

/** Messages API의 output_config.format에 넘길 JSON Schema. */
export const MONSTER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '몬스터 이름 (한국어)' },
    size: { type: 'string', description: '초소형/소형/중형/대형/거대형/초대형 중 하나' },
    type: { type: 'string', description: '종류 (예: 괴물류, 언데드, 인간형)' },
    alignment: { type: 'string', description: '성향 (예: 혼돈 악)' },
    description: { type: 'string', description: '외형과 배경을 설명하는 2~4문장' },
    cr: { type: 'string', description: '도전 지수. 정수 또는 1/8, 1/4, 1/2' },
    ac: { type: 'integer', description: '방어도' },
    ac_note: { type: 'string', description: '방어도 근거 (예: 천연 갑옷)' },
    hp: { type: 'integer', description: '평균 최대 hp' },
    hit_dice: { type: 'string', description: '히트 다이스 (예: 9d10+18)' },
    speeds: {
      type: 'object',
      properties: {
        walk: { type: 'integer' },
        fly: { type: 'integer' },
        swim: { type: 'integer' },
        climb: { type: 'integer' },
        burrow: { type: 'integer' },
      },
      required: ['walk', 'fly', 'swim', 'climb', 'burrow'],
      additionalProperties: false,
    },
    abilities: {
      type: 'object',
      properties: {
        str: { type: 'integer' },
        dex: { type: 'integer' },
        con: { type: 'integer' },
        int: { type: 'integer' },
        wis: { type: 'integer' },
        cha: { type: 'integer' },
      },
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      additionalProperties: false,
    },
    saves: bonusListSchema('ability', 'str, dex, con, int, wis, cha 중 하나'),
    skills: bonusListSchema('name', '기술 이름 (한국어, 예: 은신)'),
    vulnerabilities: { type: 'array', items: { type: 'string' } },
    resistances: { type: 'array', items: { type: 'string' } },
    immunities: { type: 'array', items: { type: 'string' } },
    condition_immunities: { type: 'array', items: { type: 'string' } },
    senses: { type: 'string', description: '감각 (예: 암시야 18m)' },
    languages: { type: 'string', description: '언어' },
    traits: { type: 'array', items: sectionSchema },
    actions: { type: 'array', items: sectionSchema },
    bonus_actions: { type: 'array', items: sectionSchema },
    reactions: { type: 'array', items: sectionSchema },
    legendary_actions: { type: 'array', items: sectionSchema },
    tactics: { type: 'string', description: 'DM 전용 전투 운영 지침' },
  },
  required: [
    'name',
    'size',
    'type',
    'alignment',
    'description',
    'cr',
    'ac',
    'ac_note',
    'hp',
    'hit_dice',
    'speeds',
    'abilities',
    'saves',
    'skills',
    'vulnerabilities',
    'resistances',
    'immunities',
    'condition_immunities',
    'senses',
    'languages',
    'traits',
    'actions',
    'bonus_actions',
    'reactions',
    'legendary_actions',
    'tactics',
  ],
  additionalProperties: false,
};

// ── 응답 정규화 ──────────────────────────────────────────────────────

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityKey = (typeof ABILITY_KEYS)[number];

export interface GeneratedMonster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  description: string;
  cr: string;
  ac: number;
  ac_note: string;
  hp: number;
  hit_dice: string;
  speeds: { walk: number; fly: number; swim: number; climb: number; burrow: number };
  abilities: Record<AbilityKey, number>;
  saves: Partial<Record<AbilityKey, number>>;
  skills: Record<string, number>;
  vulnerabilities: string[];
  resistances: string[];
  immunities: string[];
  condition_immunities: string[];
  senses: string;
  languages: string;
  traits: { name: string; description: string }[];
  actions: { name: string; description: string }[];
  bonus_actions: { name: string; description: string }[];
  reactions: { name: string; description: string }[];
  legendary_actions: { name: string; description: string }[];
  tactics: string;
}

const VALID_CR = new Set([
  '0', '1/8', '1/4', '1/2',
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function text(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return clamp(Math.round(num), min, max);
}

function stringList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sections(value: unknown, maxItems: number): { name: string; description: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { name: string; description: string }[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const name = text(record.name, 120);
    const description = text(record.description, 2000);
    if (!name || !description) continue;
    out.push({ name, description });
    if (out.length >= maxItems) break;
  }
  return out;
}

/** 프론트엔드의 cr 표기(1/8 등)를 그대로 유지하되, 알 수 없는 값은 '1'로 되돌린다. */
function challengeRating(value: unknown): string {
  const raw = text(value, 10, '1').replace(/\s/g, '');
  if (VALID_CR.has(raw)) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return '0';
    if (numeric < 0.2) return '1/8';
    if (numeric < 0.4) return '1/4';
    if (numeric < 1) return '1/2';
    return String(clamp(Math.round(numeric), 1, 30));
  }
  return '1';
}

/**
 * 모델 응답을 애플리케이션이 기대하는 형태로 정규화한다.
 * 구조화 출력을 쓰더라도 값 범위까지 보장되지는 않으므로 여기서 한 번 더 잘라 낸다.
 */
export function normalizeMonster(raw: unknown): GeneratedMonster {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PublicError('AI가 생성한 데이터 형식이 올바르지 않습니다. 다시 시도해 주세요.', 502);
  }
  const record = raw as Record<string, unknown>;

  const name = text(record.name, 120);
  if (!name) {
    throw new PublicError('AI가 생성한 데이터 형식이 올바르지 않습니다. 다시 시도해 주세요.', 502);
  }

  const speedsRaw = (typeof record.speeds === 'object' && record.speeds !== null
    ? record.speeds
    : {}) as Record<string, unknown>;
  const abilitiesRaw = (typeof record.abilities === 'object' && record.abilities !== null
    ? record.abilities
    : {}) as Record<string, unknown>;

  const abilities = {} as Record<AbilityKey, number>;
  for (const key of ABILITY_KEYS) abilities[key] = int(abilitiesRaw[key], 1, 30, 10);

  const saves: Partial<Record<AbilityKey, number>> = {};
  if (Array.isArray(record.saves)) {
    for (const entry of record.saves) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const ability = text(item.ability, 10).toLowerCase() as AbilityKey;
      if (!ABILITY_KEYS.includes(ability)) continue;
      saves[ability] = int(item.bonus, -5, 20, 0);
    }
  }

  const skills: Record<string, number> = {};
  if (Array.isArray(record.skills)) {
    for (const entry of record.skills.slice(0, 20)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const skillName = text(item.name, 40);
      if (!skillName) continue;
      skills[skillName] = int(item.bonus, -5, 20, 0);
    }
  }

  return {
    name,
    size: text(record.size, 40, '중형'),
    type: text(record.type, 60, '괴물류'),
    alignment: text(record.alignment, 60, '중립'),
    description: text(record.description, 4000),
    cr: challengeRating(record.cr),
    ac: int(record.ac, 1, 40, 12),
    ac_note: text(record.ac_note, 120),
    hp: int(record.hp, 1, 2000, 20),
    hit_dice: text(record.hit_dice, 40),
    speeds: {
      walk: int(speedsRaw.walk, 0, 500, 30),
      fly: int(speedsRaw.fly, 0, 500, 0),
      swim: int(speedsRaw.swim, 0, 500, 0),
      climb: int(speedsRaw.climb, 0, 500, 0),
      burrow: int(speedsRaw.burrow, 0, 500, 0),
    },
    abilities,
    saves,
    skills,
    vulnerabilities: stringList(record.vulnerabilities, 20, 60),
    resistances: stringList(record.resistances, 20, 60),
    immunities: stringList(record.immunities, 20, 60),
    condition_immunities: stringList(record.condition_immunities, 20, 60),
    senses: text(record.senses, 300),
    languages: text(record.languages, 300),
    traits: sections(record.traits, 20),
    actions: sections(record.actions, 20),
    bonus_actions: sections(record.bonus_actions, 10),
    reactions: sections(record.reactions, 10),
    legendary_actions: sections(record.legendary_actions, 10),
    tactics: text(record.tactics, 2000),
  };
}
