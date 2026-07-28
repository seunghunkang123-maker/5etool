import type { Card, Combatant, MonsterStats, PlayerCharacter, RevealableField, ViewerContext } from '@/data/types';
import { hpTier, type HpTier } from './hp';
import { canViewPrivateAssets, isDM } from './permissions';

/**
 * 공개 범위 필터.
 *
 * 플레이어에게 전달할 카드 표현을 화이트리스트 방식으로 만든다.
 * 서버(RLS 뷰 player_visible_cards)에서도 같은 규칙이 적용되며,
 * 이 모듈은 클라이언트 렌더링과 테스트를 위한 동일 규칙 구현이다.
 *
 * 어떤 경우에도 dm_notes는 플레이어 표현에 포함되지 않는다.
 */

export interface VisibleCard {
  id: string;
  type: Card['type'];
  name: string | null;
  summary: string | null;
  body: Card['body'] | null;
  image_url: string | null;
  /** 능력치 중 공개된 부분만 */
  stats: Partial<MonsterStats> | null;
  sections: Card['sections'] | null;
  /** 정확한 HP 대신 부상 단계만 공개할 때 사용 */
  hp_tier: HpTier | null;
  reveal_scope: Card['reveal_scope'];
}

function fieldAllowed(card: Card, field: RevealableField): boolean {
  switch (card.reveal_scope) {
    case 'hidden':
      return false;
    case 'name_only':
      return field === 'name';
    case 'image_only':
      return field === 'name' || field === 'image';
    case 'partial':
      return card.reveal_fields.includes(field);
    case 'full':
      return true;
    default:
      return false;
  }
}

/** 이 뷰어에게 카드가 보이는가 (대상 지정 공개 포함) */
export function isCardVisibleTo(card: Card, viewer: ViewerContext | null): boolean {
  if (!viewer) return false;
  if (canViewPrivateAssets(viewer)) return true;
  if (card.deleted_at || card.is_archived) return false;
  if (card.reveal_scope === 'hidden') return false;
  if (card.reveal_targets.length > 0 && !card.reveal_targets.includes(viewer.userId)) return false;
  return true;
}

/**
 * 뷰어 기준으로 카드를 투영한다.
 * DM 권한이면 원본을 그대로, 그 외에는 공개 필드만 담은 축소 표현을 반환한다.
 * 보이지 않으면 null.
 */
export function projectCardForViewer(card: Card, viewer: ViewerContext | null): VisibleCard | null {
  if (!isCardVisibleTo(card, viewer)) return null;

  if (viewer && canViewPrivateAssets(viewer)) {
    return {
      id: card.id,
      type: card.type,
      name: card.name,
      summary: card.summary,
      body: card.body,
      image_url: card.image_url,
      stats: card.stats ?? null,
      sections: card.sections ?? null,
      hp_tier: card.stats ? hpTier(card.stats.hp, card.stats.max_hp) : null,
      reveal_scope: card.reveal_scope,
    };
  }

  const stats = card.stats;
  let visibleStats: Partial<MonsterStats> | null = null;
  if (stats) {
    const partial: Partial<MonsterStats> = {};
    if (fieldAllowed(card, 'hp_current')) partial.hp = stats.hp;
    if (fieldAllowed(card, 'hp_max')) partial.max_hp = stats.max_hp;
    if (fieldAllowed(card, 'ac')) partial.ac = stats.ac;
    if (fieldAllowed(card, 'abilities')) partial.abilities = stats.abilities;
    if (fieldAllowed(card, 'speeds')) partial.speeds = stats.speeds;
    if (fieldAllowed(card, 'cr')) {
      partial.cr = stats.cr;
      partial.type = stats.type;
      partial.size = stats.size;
    }
    if (Object.keys(partial).length > 0) visibleStats = partial;
  }

  // 정확한 HP를 숨기더라도 부상 단계는 공개할 수 있다.
  const showTier = fieldAllowed(card, 'conditions') || fieldAllowed(card, 'hp_current');

  return {
    id: card.id,
    type: card.type,
    name: fieldAllowed(card, 'name') ? card.name : null,
    summary: fieldAllowed(card, 'summary') ? card.summary : null,
    body: fieldAllowed(card, 'body') ? card.body : null,
    image_url: fieldAllowed(card, 'image') ? card.image_url : null,
    stats: visibleStats,
    sections: fieldAllowed(card, 'actions') ? (card.sections ?? null) : null,
    hp_tier: showTier && stats ? hpTier(stats.hp, stats.max_hp) : null,
    reveal_scope: card.reveal_scope,
  };
}

/** 목록 전체를 투영하고 보이지 않는 카드를 제거한다. */
export function projectCards(cards: readonly Card[], viewer: ViewerContext | null): VisibleCard[] {
  return cards.map((c) => projectCardForViewer(c, viewer)).filter((c): c is VisibleCard => c !== null);
}

// ── 전투 참가자 ────────────────────────────────────────────────

export interface VisibleCombatant {
  id: string;
  name: string;
  image_url: string | null;
  initiative: number | null;
  is_defeated: boolean;
  is_concentrating: boolean;
  hp: number | null;
  max_hp: number | null;
  temp_hp: number | null;
  ac: number | null;
  hp_tier: HpTier;
  conditions: { id: string; name: string; icon: string }[];
  source_type: Combatant['source_type'];
}

/**
 * 전투 참가자 투영.
 * - 숨김 처리된 참가자는 DM에게만 보인다.
 * - 몬스터의 정확한 HP는 hide_hp_numbers일 때 숨기고 부상 단계만 노출한다.
 * - 비공개 상태 효과는 DM에게만 보인다.
 * - 플레이어 캐릭터는 캠페인 파티 공개 설정을 따른다(호출자가 partyVisibility 전달).
 */
export function projectCombatantForViewer(
  combatant: Combatant,
  viewer: ViewerContext | null,
  options: { partyHpNumbers?: boolean; partyAc?: boolean; partyConditions?: boolean; ownCharacterIds?: string[] } = {},
): VisibleCombatant | null {
  const dm = isDM(viewer) || canViewPrivateAssets(viewer);
  if (!dm && combatant.is_hidden) return null;

  const tier = hpTier(combatant.hp, combatant.max_hp);
  const isOwn = Boolean(combatant.character_id && options.ownCharacterIds?.includes(combatant.character_id));

  const conditions = (combatant.conditions ?? [])
    .filter((c) => dm || c.is_public)
    .map((c) => ({
      id: c.id,
      name: c.custom_name ?? c.condition_key,
      icon: c.icon,
    }));

  if (dm) {
    return {
      id: combatant.id,
      name: combatant.name,
      image_url: combatant.image_url,
      initiative: combatant.initiative,
      is_defeated: combatant.is_defeated,
      is_concentrating: combatant.is_concentrating,
      hp: combatant.hp,
      max_hp: combatant.max_hp,
      temp_hp: combatant.temp_hp,
      ac: combatant.ac,
      hp_tier: tier,
      conditions,
      source_type: combatant.source_type,
    };
  }

  const isPC = combatant.source_type === 'pc';
  const showNumbers = isOwn || (isPC ? options.partyHpNumbers !== false : !combatant.hide_hp_numbers);
  const showAc = isOwn || (isPC ? options.partyAc !== false : !combatant.hide_hp_numbers);

  return {
    id: combatant.id,
    name: combatant.name,
    image_url: combatant.image_url,
    initiative: combatant.initiative,
    is_defeated: combatant.is_defeated,
    is_concentrating: combatant.is_concentrating,
    hp: showNumbers ? combatant.hp : null,
    max_hp: showNumbers ? combatant.max_hp : null,
    temp_hp: showNumbers ? combatant.temp_hp : null,
    ac: showAc ? combatant.ac : null,
    hp_tier: tier,
    conditions: options.partyConditions === false && isPC && !isOwn ? [] : conditions,
    source_type: combatant.source_type,
  };
}

// ── 캐릭터 시트 ────────────────────────────────────────────────

export interface VisibleCharacter {
  id: string;
  name: string;
  klass: string | null;
  level: number | null;
  image_url: string | null;
  hp: number | null;
  max_hp: number | null;
  temp_hp: number | null;
  ac: number | null;
  hp_tier: HpTier;
  isOwn: boolean;
  canEdit: boolean;
}

/**
 * 파티 상태판용 캐릭터 투영.
 * 본인과 DM은 전체를, 다른 플레이어는 캠페인 공개 설정 ∩ 캐릭터 공유 설정만 본다.
 */
export function projectCharacterForViewer(
  character: PlayerCharacter,
  viewer: ViewerContext | null,
  partyVisibility: { hp_numbers: boolean; ac: boolean; class_level: boolean },
): VisibleCharacter {
  const dm = isDM(viewer);
  const isOwn = viewer?.userId === character.user_id;
  const full = dm || isOwn;

  const showHpNumbers = full || (partyVisibility.hp_numbers && character.share_settings.show_hp_numbers);
  const showAc = full || (partyVisibility.ac && character.share_settings.show_ac);
  const showClass = full || partyVisibility.class_level;

  return {
    id: character.id,
    name: character.name,
    klass: showClass ? character.klass : null,
    level: showClass ? character.level : null,
    image_url: character.image_url,
    hp: showHpNumbers ? character.hp : null,
    max_hp: showHpNumbers ? character.max_hp : null,
    temp_hp: showHpNumbers ? character.temp_hp : null,
    ac: showAc ? character.ac : null,
    hp_tier: hpTier(character.hp, character.max_hp),
    isOwn,
    canEdit: full,
  };
}
