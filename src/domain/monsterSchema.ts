import { z } from 'zod';
import type { AbilityScores, CardSection, MonsterStats, SectionKind } from '@/data/types';
import { parseChallengeRating, proficiencyBonusForCR } from './abilities';

/**
 * AI가 생성한 몬스터 초안의 스키마.
 * AI 응답은 반드시 이 스키마를 통과해야 카드로 저장할 수 있다.
 */

const abilityScore = z.number().int().min(1).max(30);

const sectionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
});

export const generatedMonsterSchema = z.object({
  name: z.string().min(1).max(120),
  size: z.string().max(40).default('중형'),
  type: z.string().max(60).default('괴물류'),
  alignment: z.string().max(60).default('중립'),
  description: z.string().max(4000).default(''),
  cr: z.string().max(10).default('1'),
  ac: z.number().int().min(1).max(40),
  ac_note: z.string().max(120).default(''),
  hp: z.number().int().min(1).max(2000),
  hit_dice: z.string().max(40).default(''),
  speeds: z
    .object({
      walk: z.number().int().min(0).max(500).default(30),
      fly: z.number().int().min(0).max(500).default(0),
      swim: z.number().int().min(0).max(500).default(0),
      climb: z.number().int().min(0).max(500).default(0),
      burrow: z.number().int().min(0).max(500).default(0),
    })
    .default({ walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 }),
  abilities: z.object({
    str: abilityScore,
    dex: abilityScore,
    con: abilityScore,
    int: abilityScore,
    wis: abilityScore,
    cha: abilityScore,
  }),
  saves: z.record(z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']), z.number().int().min(-5).max(20)).default({}),
  skills: z.record(z.string().max(40), z.number().int().min(-5).max(20)).default({}),
  vulnerabilities: z.array(z.string().max(60)).max(20).default([]),
  resistances: z.array(z.string().max(60)).max(20).default([]),
  immunities: z.array(z.string().max(60)).max(20).default([]),
  condition_immunities: z.array(z.string().max(60)).max(20).default([]),
  senses: z.string().max(300).default(''),
  languages: z.string().max(300).default(''),
  traits: z.array(sectionSchema).max(20).default([]),
  actions: z.array(sectionSchema).max(20).default([]),
  bonus_actions: z.array(sectionSchema).max(10).default([]),
  reactions: z.array(sectionSchema).max(10).default([]),
  legendary_actions: z.array(sectionSchema).max(10).default([]),
  tactics: z.string().max(2000).default(''),
});

export type GeneratedMonster = z.infer<typeof generatedMonsterSchema>;

/** AI 생성 요청 파라미터 */
export const monsterPromptSchema = z.object({
  prompt: z.string().min(5, '설명을 5자 이상 입력해 주세요.').max(1500, '설명은 1500자를 넘을 수 없습니다.'),
  target_cr: z.string().max(10).optional(),
  role: z.string().max(60).optional(),
  size: z.string().max(40).optional(),
  type: z.string().max(60).optional(),
  tactics: z.string().max(200).optional(),
  key_abilities: z.array(z.string().max(20)).max(6).optional(),
  damage_types: z.array(z.string().max(30)).max(8).optional(),
  gimmick: z.string().max(300).optional(),
  party_size: z.number().int().min(1).max(10).optional(),
  party_level: z.number().int().min(1).max(20).optional(),
});

export type MonsterPromptInput = z.infer<typeof monsterPromptSchema>;

/** AI 결과를 카드 저장 형태로 변환한다. */
export function generatedMonsterToCard(gen: GeneratedMonster): {
  name: string;
  summary: string;
  dm_notes: string;
  stats: Omit<MonsterStats, 'card_id'>;
  sections: Omit<CardSection, 'id' | 'card_id'>[];
} {
  const abilities: AbilityScores = gen.abilities;
  const pb = proficiencyBonusForCR(gen.cr);
  const crValue = parseChallengeRating(gen.cr);

  const sections: Omit<CardSection, 'id' | 'card_id'>[] = [];
  const push = (kind: SectionKind, items: { name: string; description: string }[]) => {
    items.forEach((item, i) => {
      sections.push({ kind, name: item.name, description: item.description, sort_order: sections.length + i });
    });
  };
  push('trait', gen.traits);
  push('action', gen.actions);
  push('bonus', gen.bonus_actions);
  push('reaction', gen.reactions);
  push('legendary', gen.legendary_actions);

  return {
    name: gen.name,
    summary: gen.description,
    dm_notes: gen.tactics ? `전투 운영 지침\n${gen.tactics}` : '',
    stats: {
      size: gen.size,
      type: gen.type,
      alignment: gen.alignment,
      cr: gen.cr,
      proficiency_bonus: pb,
      xp: xpForCR(crValue),
      ac: gen.ac,
      ac_note: gen.ac_note,
      hp: gen.hp,
      max_hp: gen.hp,
      temp_hp: 0,
      hit_dice: gen.hit_dice,
      speeds: gen.speeds,
      abilities,
      saves: gen.saves,
      skills: gen.skills,
      vulnerabilities: gen.vulnerabilities,
      resistances: gen.resistances,
      immunities: gen.immunities,
      condition_immunities: gen.condition_immunities,
      senses: gen.senses,
      passive_perception: 10 + Math.floor((abilities.wis - 10) / 2),
      languages: gen.languages,
      spellcasting_ability: null,
    },
    sections,
  };
}

const XP_BY_CR: Record<string, number> = {
  '0': 10, '0.125': 25, '0.25': 50, '0.5': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
  '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000,
  '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000,
  '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

export function xpForCR(cr: number): number {
  return XP_BY_CR[String(cr)] ?? 0;
}

/**
 * AI 응답 파싱. 실패 시 사용자에게 보여줄 한국어 오류를 담아 반환한다.
 */
export function parseGeneratedMonster(raw: unknown):
  | { ok: true; data: GeneratedMonster }
  | { ok: false; error: string; issues: string[] } {
  const result = generatedMonsterSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues.map((i) => `${i.path.join('.') || '(루트)'}: ${i.message}`);
  return {
    ok: false,
    error: 'AI가 생성한 데이터 형식이 올바르지 않습니다. 다시 시도해 주세요.',
    issues,
  };
}
