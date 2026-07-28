import { describe, expect, it } from 'vitest';
import type { Combatant } from '@/data/types';
import { nextTurn, normalizeDuplicateNames, previousTurn, sortByInitiative, turnOrder, uniqueCombatantName } from './initiative';

type Entry = Pick<Combatant, 'id' | 'initiative' | 'dex_mod' | 'dex_score' | 'initiative_tiebreak' | 'sort_order'>;

function entry(id: string, initiative: number | null, dexMod = 0, dexScore = 10, tiebreak = 0, sortOrder = 0): Entry {
  return { id, initiative, dex_mod: dexMod, dex_score: dexScore, initiative_tiebreak: tiebreak, sort_order: sortOrder };
}

describe('sortByInitiative', () => {
  it('이니셔티브가 높은 순서로 정렬한다', () => {
    const sorted = sortByInitiative([entry('a', 12), entry('b', 20), entry('c', 5)]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('동점이면 민첩 수정치가 높은 쪽이 앞선다', () => {
    const sorted = sortByInitiative([entry('a', 15, 1), entry('b', 15, 4)]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('민첩 수정치도 같으면 민첩 수치로 비교한다', () => {
    const sorted = sortByInitiative([entry('a', 15, 2, 14), entry('b', 15, 2, 15)]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('DM이 지정한 동점 처리값이 최종 기준이 된다', () => {
    const sorted = sortByInitiative([entry('a', 15, 2, 14, 0), entry('b', 15, 2, 14, 5)]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('dex_score 규칙에서는 수정치를 건너뛴다', () => {
    const sorted = sortByInitiative([entry('a', 15, 5, 12), entry('b', 15, 0, 13)], 'dex_score');
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('완전히 같으면 순서가 안정적이다', () => {
    const list = [entry('b', 10, 0, 10, 0, 1), entry('a', 10, 0, 10, 0, 0)];
    expect(sortByInitiative(list).map((e) => e.id)).toEqual(['a', 'b']);
    expect(sortByInitiative(list).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('입력 배열을 변경하지 않는다', () => {
    const list = [entry('a', 5), entry('b', 20)];
    sortByInitiative(list);
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('turnOrder', () => {
  it('이니셔티브가 입력되지 않은 참가자를 제외한다', () => {
    const order = turnOrder([entry('a', 10), entry('b', null), entry('c', 15)]);
    expect(order.map((e) => e.id)).toEqual(['c', 'a']);
  });
});

describe('nextTurn', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('다음 참가자로 넘어간다', () => {
    expect(nextTurn(order, { round: 1, activeCombatantId: 'a' })).toEqual({ round: 1, activeCombatantId: 'b' });
  });

  it('마지막 참가자의 턴이 끝나면 라운드가 1 증가한다', () => {
    expect(nextTurn(order, { round: 1, activeCombatantId: 'c' })).toEqual({ round: 2, activeCombatantId: 'a' });
  });

  it('활성 참가자가 없으면 첫 참가자부터 시작한다', () => {
    expect(nextTurn(order, { round: 0, activeCombatantId: null })).toEqual({ round: 1, activeCombatantId: 'a' });
  });

  it('참가자가 없으면 상태를 유지한다', () => {
    const state = { round: 3, activeCombatantId: 'x' };
    expect(nextTurn([], state)).toBe(state);
  });
});

describe('previousTurn', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('이전 참가자로 돌아간다', () => {
    expect(previousTurn(order, { round: 2, activeCombatantId: 'b' })).toEqual({ round: 2, activeCombatantId: 'a' });
  });

  it('첫 참가자에서 되돌리면 라운드가 감소하고 마지막 참가자로 간다', () => {
    expect(previousTurn(order, { round: 2, activeCombatantId: 'a' })).toEqual({ round: 1, activeCombatantId: 'c' });
  });

  it('1라운드 첫 참가자보다 이전으로 가지 않는다', () => {
    expect(previousTurn(order, { round: 1, activeCombatantId: 'a' })).toEqual({ round: 1, activeCombatantId: 'a' });
  });
});

describe('uniqueCombatantName', () => {
  it('중복이 없으면 원래 이름을 쓴다', () => {
    expect(uniqueCombatantName('고블린', [])).toBe('고블린');
    expect(uniqueCombatantName('고블린', ['오크'])).toBe('고블린');
  });

  it('중복되면 번호를 붙인다', () => {
    expect(uniqueCombatantName('고블린', ['고블린'])).toBe('고블린 2');
    expect(uniqueCombatantName('고블린', ['고블린 1', '고블린 2'])).toBe('고블린 3');
  });

  it('다른 이름의 번호에 영향받지 않는다', () => {
    expect(uniqueCombatantName('고블린', ['고블린 대장 5'])).toBe('고블린');
  });

  it('정규식 특수문자가 포함된 이름을 안전하게 처리한다', () => {
    expect(uniqueCombatantName('마법사(변신)', ['마법사(변신)'])).toBe('마법사(변신) 2');
  });
});

describe('normalizeDuplicateNames', () => {
  it('중복 그룹의 첫 항목에 1을 붙인다', () => {
    expect(normalizeDuplicateNames(['고블린', '고블린 2'])).toEqual(['고블린 1', '고블린 2']);
  });

  it('중복이 아니면 그대로 둔다', () => {
    expect(normalizeDuplicateNames(['고블린', '오크'])).toEqual(['고블린', '오크']);
  });
});
