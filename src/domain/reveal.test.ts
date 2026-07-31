import { describe, expect, it } from 'vitest';
import type { Card, Combatant, PlayerCharacter, ViewerContext } from '@/data/types';
import { defaultCharacter, defaultMonsterStats } from '@/data/defaults';
import { isCardVisibleTo, projectCardForViewer, projectCards, projectCharacterForViewer, projectCombatantForViewer } from './reveal';

const dm: ViewerContext = { userId: 'dm', role: 'owner', permissions: {} };
const player: ViewerContext = { userId: 'p1', role: 'player', permissions: {} };
const otherPlayer: ViewerContext = { userId: 'p2', role: 'player', permissions: {} };
const spectator: ViewerContext = { userId: 's1', role: 'spectator', permissions: {} };

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    campaign_id: 'camp',
    folder_id: null,
    type: 'monster',
    name: '얼음 기사',
    summary: '얼어붙은 호수의 수호자',
    body: { type: 'doc', content: [] },
    image_url: 'https://example.test/knight.png',
    reveal_scope: 'hidden',
    reveal_fields: [],
    reveal_targets: [],
    is_temporary_reveal: false,
    previous_scope: null,
    is_favorite: false,
    is_archived: false,
    sort_order: 0,
    dm_notes: '이 몬스터의 약점은 화염이다',
    created_by: 'dm',
    version: 1,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    stats: { ...defaultMonsterStats('c1'), hp: 60, max_hp: 100, ac: 18 },
    sections: [{ id: 's1', card_id: 'c1', kind: 'action', name: '냉기 반격', description: '설명', sort_order: 0 }],
    ...overrides,
  };
}

describe('isCardVisibleTo', () => {
  it('DM은 비공개 카드도 볼 수 있다', () => {
    expect(isCardVisibleTo(card(), dm)).toBe(true);
  });

  it('플레이어는 비공개 카드의 존재를 알 수 없다', () => {
    expect(isCardVisibleTo(card(), player)).toBe(false);
  });

  it('로그인하지 않은 뷰어는 아무것도 볼 수 없다', () => {
    expect(isCardVisibleTo(card({ reveal_scope: 'full' }), null)).toBe(false);
  });

  it('대상 지정 공개는 지정된 플레이어에게만 보인다', () => {
    const c = card({ reveal_scope: 'full', reveal_targets: ['p1'] });
    expect(isCardVisibleTo(c, player)).toBe(true);
    expect(isCardVisibleTo(c, otherPlayer)).toBe(false);
  });

  it('보관되었거나 삭제된 카드는 플레이어에게 보이지 않는다', () => {
    expect(isCardVisibleTo(card({ reveal_scope: 'full', is_archived: true }), player)).toBe(false);
    expect(isCardVisibleTo(card({ reveal_scope: 'full', deleted_at: '2026-01-02T00:00:00.000Z' }), player)).toBe(false);
  });
});

describe('projectCardForViewer — 공개 범위별 필드 노출', () => {
  it('비공개: null을 반환한다', () => {
    expect(projectCardForViewer(card(), player)).toBeNull();
  });

  it('이름만 공개: 이름과 유형만 노출한다', () => {
    const view = projectCardForViewer(card({ reveal_scope: 'name_only' }), player);
    expect(view).not.toBeNull();
    expect(view?.name).toBe('얼음 기사');
    expect(view?.type).toBe('monster');
    expect(view?.image_url).toBeNull();
    expect(view?.summary).toBeNull();
    expect(view?.body).toBeNull();
    expect(view?.stats).toBeNull();
    expect(view?.sections).toBeNull();
  });

  it('이미지만 공개: 이름과 이미지만 노출한다', () => {
    const view = projectCardForViewer(card({ reveal_scope: 'image_only' }), player);
    expect(view?.image_url).toBe('https://example.test/knight.png');
    expect(view?.body).toBeNull();
    expect(view?.stats).toBeNull();
  });

  it('일부 공개: 지정한 필드만 노출한다', () => {
    const view = projectCardForViewer(
      card({ reveal_scope: 'partial', reveal_fields: ['name', 'image', 'hp_current', 'conditions'] }),
      player,
    );
    expect(view?.name).toBe('얼음 기사');
    expect(view?.image_url).not.toBeNull();
    expect(view?.stats?.hp).toBe(60);
    expect(view?.stats?.max_hp).toBeUndefined();
    expect(view?.stats?.ac).toBeUndefined();
    expect(view?.sections).toBeNull();
  });

  it('일부 공개: 최대 HP와 방어도를 감출 수 있다', () => {
    const view = projectCardForViewer(card({ reveal_scope: 'partial', reveal_fields: ['name'] }), player);
    expect(view?.stats).toBeNull();
    expect(view?.hp_tier).toBeNull();
  });

  it('전체 공개: 공개 가능한 모든 정보를 노출한다', () => {
    const view = projectCardForViewer(card({ reveal_scope: 'full' }), player);
    expect(view?.summary).toBe('얼어붙은 호수의 수호자');
    expect(view?.stats?.ac).toBe(18);
    expect(view?.sections).toHaveLength(1);
  });

  it('어떤 공개 범위에서도 DM 전용 메모는 노출되지 않는다', () => {
    for (const scope of ['name_only', 'image_only', 'partial', 'full'] as const) {
      const view = projectCardForViewer(card({ reveal_scope: scope, reveal_fields: ['name', 'image', 'summary', 'body', 'hp_current', 'hp_max', 'ac', 'abilities', 'conditions', 'actions'] }), player);
      expect(JSON.stringify(view)).not.toContain('약점은 화염');
    }
  });

  it('관전자도 플레이어와 같은 필터를 적용받는다', () => {
    expect(projectCardForViewer(card(), spectator)).toBeNull();
    expect(projectCardForViewer(card({ reveal_scope: 'name_only' }), spectator)?.summary).toBeNull();
  });

  it('DM은 원본 그대로 본다', () => {
    const view = projectCardForViewer(card(), dm);
    expect(view?.summary).toBe('얼어붙은 호수의 수호자');
    expect(view?.stats?.hp).toBe(60);
  });

  it('view_assets 권한을 가진 공동 DM도 전체를 본다', () => {
    const coDm: ViewerContext = { userId: 'co', role: 'co_dm', permissions: { view_assets: true } };
    expect(projectCardForViewer(card(), coDm)?.stats?.ac).toBe(18);
  });

  it('권한 없는 공동 DM은 공개 범위를 따른다', () => {
    const coDm: ViewerContext = { userId: 'co', role: 'co_dm', permissions: {} };
    expect(projectCardForViewer(card(), coDm)).toBeNull();
  });
});

describe('projectCards', () => {
  it('보이지 않는 카드를 목록에서 제거한다', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b', reveal_scope: 'full' })];
    const result = projectCards(cards, player);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('b');
  });
});

describe('projectCombatantForViewer', () => {
  function combatant(overrides: Partial<Combatant> = {}): Combatant {
    return {
      id: 'k1',
      encounter_id: 'e1',
      source_type: 'monster',
      source_card_id: null,
      character_id: null,
      name: '고블린 1',
      image_url: null,
      initiative: 14,
      initiative_tiebreak: 0,
      dex_mod: 2,
      dex_score: 14,
      hp: 3,
      max_hp: 12,
      temp_hp: 0,
      ac: 15,
      is_hidden: false,
      is_defeated: false,
      is_concentrating: false,
      concentration_note: '',
      hide_hp_numbers: true,
      dm_notes: '숨겨진 계획',
      sort_order: 0,
      conditions: [
        { id: 'cc1', combatant_id: 'k1', condition_key: 'poisoned', custom_name: '중독', icon: 'flask', description: '', started_round: 1, duration_mode: 'manual', duration_rounds: null, source_combatant_id: null, linked_concentration: false,
      stacks: 1, is_public: true, created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'cc2', combatant_id: 'k1', condition_key: 'secret', custom_name: '비밀 표식', icon: 'eye', description: '', started_round: 1, duration_mode: 'manual', duration_rounds: null, source_combatant_id: null, linked_concentration: false,
      stacks: 1, is_public: false, created_at: '2026-01-01T00:00:00.000Z' },
      ],
      ...overrides,
    };
  }

  it('숨김 참가자는 플레이어에게 보이지 않는다', () => {
    expect(projectCombatantForViewer(combatant({ is_hidden: true }), player)).toBeNull();
    expect(projectCombatantForViewer(combatant({ is_hidden: true }), dm)).not.toBeNull();
  });

  it('정확한 HP를 숨기면 부상 단계만 노출한다', () => {
    const view = projectCombatantForViewer(combatant(), player);
    expect(view?.hp).toBeNull();
    expect(view?.max_hp).toBeNull();
    expect(view?.hp_tier).toBe('critical');
  });

  it('DM에게는 정확한 수치를 노출한다', () => {
    const view = projectCombatantForViewer(combatant(), dm);
    expect(view?.hp).toBe(3);
    expect(view?.max_hp).toBe(12);
  });

  it('비공개 상태 효과는 DM에게만 보인다', () => {
    expect(projectCombatantForViewer(combatant(), player)?.conditions).toHaveLength(1);
    expect(projectCombatantForViewer(combatant(), dm)?.conditions).toHaveLength(2);
  });

  it('DM 메모는 플레이어 표현에 포함되지 않는다', () => {
    const view = projectCombatantForViewer(combatant(), player);
    expect(JSON.stringify(view)).not.toContain('숨겨진 계획');
  });

  it('자기 캐릭터의 수치는 항상 볼 수 있다', () => {
    const c = combatant({ source_type: 'pc', character_id: 'char1', hide_hp_numbers: true });
    const view = projectCombatantForViewer(c, player, { ownCharacterIds: ['char1'] });
    expect(view?.hp).toBe(3);
  });

  it('파티 설정에서 HP 숫자를 감추면 다른 플레이어에게 숨긴다', () => {
    const c = combatant({ source_type: 'pc', character_id: 'char1' });
    const view = projectCombatantForViewer(c, otherPlayer, { partyHpNumbers: false, ownCharacterIds: [] });
    expect(view?.hp).toBeNull();
    expect(view?.hp_tier).toBe('critical');
  });
});

describe('projectCharacterForViewer', () => {
  function character(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
    return {
      ...defaultCharacter('camp', 'p1', '아린'),
      id: 'char1',
      klass: '위저드',
      level: 5,
      hp: 12,
      max_hp: 32,
      ac: 15,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  const openParty = { hp_numbers: true, ac: true, class_level: true };
  const closedParty = { hp_numbers: false, ac: false, class_level: false };

  it('본인은 전체를 본다', () => {
    const view = projectCharacterForViewer(character(), player, closedParty);
    expect(view.hp).toBe(12);
    expect(view.canEdit).toBe(true);
    expect(view.isOwn).toBe(true);
  });

  it('DM은 전체를 본다', () => {
    const view = projectCharacterForViewer(character(), dm, closedParty);
    expect(view.ac).toBe(15);
    expect(view.canEdit).toBe(true);
  });

  it('다른 플레이어는 캠페인 설정을 따른다', () => {
    expect(projectCharacterForViewer(character(), otherPlayer, openParty).hp).toBe(12);
    expect(projectCharacterForViewer(character(), otherPlayer, closedParty).hp).toBeNull();
  });

  it('캐릭터 개인 공유 설정이 캠페인 설정보다 우선한다(둘 다 허용해야 노출)', () => {
    const c = character({ share_settings: { show_hp_numbers: false, show_ac: true, show_conditions: true, show_sheet: false } });
    const view = projectCharacterForViewer(c, otherPlayer, openParty);
    expect(view.hp).toBeNull();
    expect(view.ac).toBe(15);
  });

  it('HP를 숨겨도 부상 단계는 계산된다', () => {
    const view = projectCharacterForViewer(character(), otherPlayer, closedParty);
    expect(view.hp_tier).toBe('wounded');
  });
});
