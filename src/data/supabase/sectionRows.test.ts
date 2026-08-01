import { describe, expect, it } from 'vitest';
import { sectionRows } from './repo';

/**
 * 행동/특성 저장 회귀 방지.
 *
 * 화면이 타입을 맞추려고 id에 빈 문자열을 채워 보내던 시절, uuid 열에 ''가 들어가
 * "invalid input syntax for type uuid" 로 카드 저장이 통째로 실패했다.
 * 게다가 cards 행의 버전은 이미 올라간 뒤라 다음 저장은 충돌로 이어져,
 * 특성이 하나라도 있는 몬스터는 영영 저장되지 않았다.
 */
describe('sectionRows', () => {
  it('id를 절대 넘기지 않는다', () => {
    const rows = sectionRows('card-1', [
      { id: '', kind: 'trait', name: '화염 숨결', description: '뜨겁다' },
      { id: 'e1cf1b3a-0000-4000-8000-000000000000', kind: 'action', name: '물기', description: '' },
    ]);

    for (const row of rows) {
      expect(row).not.toHaveProperty('id');
    }
  });

  it('card_id는 인자로 받은 값으로 덮어쓴다', () => {
    const rows = sectionRows('card-1', [{ card_id: '엉뚱한-값', kind: 'trait', name: 'a', description: '' }]);
    expect(rows[0]?.card_id).toBe('card-1');
  });

  it('정렬 순서는 배열 순서로 다시 매긴다', () => {
    const rows = sectionRows('card-1', [
      { kind: 'trait', name: 'a', description: '', sort_order: 99 },
      { kind: 'action', name: 'b', description: '', sort_order: 5 },
      { kind: 'action', name: 'c', description: '' },
    ]);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  it('내용은 그대로 유지한다', () => {
    const rows = sectionRows('card-1', [{ kind: 'legendary', name: '전설적 행동', description: '<strong>강하다</strong>' }]);
    expect(rows[0]).toEqual({
      card_id: 'card-1',
      kind: 'legendary',
      name: '전설적 행동',
      description: '<strong>강하다</strong>',
      sort_order: 0,
    });
  });

  it('빈 목록은 빈 배열', () => {
    expect(sectionRows('card-1', [])).toEqual([]);
  });
});
