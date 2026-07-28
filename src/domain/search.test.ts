import { describe, expect, it } from 'vitest';
import type { Card } from '@/data/types';
import { descendantFolderIds, filterCards, normalizeQuery, rankCards } from './search';

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    campaign_id: 'camp',
    folder_id: null,
    type: 'monster',
    name: '고블린',
    summary: '작고 교활한 존재',
    body: null,
    image_url: null,
    reveal_scope: 'hidden',
    reveal_fields: [],
    reveal_targets: [],
    is_temporary_reveal: false,
    previous_scope: null,
    is_favorite: false,
    is_archived: false,
    sort_order: 0,
    dm_notes: '',
    created_by: 'dm',
    version: 1,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tag_ids: [],
    ...overrides,
  };
}

describe('normalizeQuery', () => {
  it('공백 기준으로 토큰을 나눈다', () => {
    expect(normalizeQuery('  얼음  기사 ')).toEqual(['얼음', '기사']);
    expect(normalizeQuery('')).toEqual([]);
  });
});

describe('filterCards', () => {
  const cards = [
    card({ id: 'a', name: '고블린', type: 'monster', tag_ids: ['t1'] }),
    card({ id: 'b', name: '엘프 상인', summary: '항구의 무기 상인', type: 'npc', folder_id: 'f1', is_favorite: true }),
    card({ id: 'c', name: '오래된 지도', summary: '', type: 'map', is_archived: true }),
    card({ id: 'd', name: '삭제된 카드', summary: '', deleted_at: '2026-01-02T00:00:00.000Z' }),
  ];

  it('삭제된 카드는 항상 제외한다', () => {
    expect(filterCards(cards, {}).map((c) => c.id)).not.toContain('d');
  });

  it('보관된 카드는 기본적으로 제외한다', () => {
    expect(filterCards(cards, {}).map((c) => c.id)).not.toContain('c');
    expect(filterCards(cards, { includeArchived: true }).map((c) => c.id)).toContain('c');
  });

  it('카드 유형으로 필터링한다', () => {
    expect(filterCards(cards, { types: ['npc'] }).map((c) => c.id)).toEqual(['b']);
  });

  it('폴더로 필터링한다', () => {
    expect(filterCards(cards, { folderId: 'f1' }).map((c) => c.id)).toEqual(['b']);
    expect(filterCards(cards, { folderId: null }).map((c) => c.id)).toEqual(['a']);
  });

  it('태그로 필터링한다', () => {
    expect(filterCards(cards, { tagIds: ['t1'] }).map((c) => c.id)).toEqual(['a']);
    expect(filterCards(cards, { tagIds: ['없음'] })).toHaveLength(0);
  });

  it('즐겨찾기만 필터링한다', () => {
    expect(filterCards(cards, { favoritesOnly: true }).map((c) => c.id)).toEqual(['b']);
  });

  it('이름과 요약을 검색한다', () => {
    expect(filterCards(cards, { query: '고블린' }).map((c) => c.id)).toEqual(['a']);
    expect(filterCards(cards, { query: '교활' }).map((c) => c.id)).toEqual(['a']);
  });

  it('DM 메모는 옵션이 켜졌을 때만 검색한다', () => {
    const list = [card({ id: 'x', name: '평범한 상자', dm_notes: '안에 미믹이 있다' })];
    expect(filterCards(list, { query: '미믹' })).toHaveLength(0);
    expect(filterCards(list, { query: '미믹', includeDmNotes: true })).toHaveLength(1);
  });

  it('여러 토큰을 AND로 처리한다', () => {
    const list = [card({ id: 'x', name: '얼음 기사' }), card({ id: 'y', name: '불꽃 기사' })];
    expect(filterCards(list, { query: '얼음 기사' }).map((c) => c.id)).toEqual(['x']);
  });

  it('하위 폴더를 포함해 검색한다', () => {
    const folders = [
      { id: 'root', parent_id: null },
      { id: 'child', parent_id: 'root' },
    ];
    const list = [card({ id: 'x', folder_id: 'child' })];
    expect(filterCards(list, { folderId: 'root' }, folders)).toHaveLength(0);
    expect(filterCards(list, { folderId: 'root', includeDescendants: true }, folders)).toHaveLength(1);
  });
});

describe('descendantFolderIds', () => {
  it('모든 하위 폴더를 수집한다', () => {
    const folders = [
      { id: 'a', parent_id: null },
      { id: 'b', parent_id: 'a' },
      { id: 'c', parent_id: 'b' },
      { id: 'd', parent_id: null },
    ];
    expect(descendantFolderIds(folders, 'a').sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('rankCards', () => {
  it('이름 완전 일치를 가장 앞에 둔다', () => {
    const list = [
      card({ id: 'partial', name: '고블린 대장' }),
      card({ id: 'exact', name: '고블린' }),
    ];
    expect(rankCards(list, '고블린').map((c) => c.id)).toEqual(['exact', 'partial']);
  });

  it('검색어가 없으면 정렬 순서를 따른다', () => {
    const list = [card({ id: 'b', sort_order: 2 }), card({ id: 'a', sort_order: 1 })];
    expect(rankCards(list, '').map((c) => c.id)).toEqual(['a', 'b']);
  });
});
