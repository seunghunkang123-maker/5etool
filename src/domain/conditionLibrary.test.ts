import { describe, expect, it } from 'vitest';
import type { Condition } from '@/data/types';
import { findByKey, searchConditions, toEntries } from './conditionLibrary';

function make(partial: Partial<Condition> & { key: string; name: string }): Condition {
  return {
    id: partial.id ?? `id-${partial.key}`,
    campaign_id: partial.campaign_id ?? null,
    key: partial.key,
    name: partial.name,
    icon: partial.icon ?? 'circle',
    description: partial.description ?? '',
    is_stackable: partial.is_stackable ?? false,
    color: partial.color ?? null,
    sort_order: partial.sort_order ?? 0,
  };
}

describe('toEntries', () => {
  it('첫 줄을 요약, 나머지를 세부 규칙으로 나눈다', () => {
    const [entry] = toEntries([make({ key: 'bleed', name: '출혈', description: '턴마다 피해.\n스택만큼 아프다.\n턴 끝에 1 감소.' })]);
    expect(entry?.summary).toBe('턴마다 피해.');
    expect(entry?.details).toEqual(['스택만큼 아프다.', '턴 끝에 1 감소.']);
  });

  it('빈 줄을 걸러낸다', () => {
    const [entry] = toEntries([make({ key: 'x', name: 'X', description: '요약\n\n  \n세부' })]);
    expect(entry?.details).toEqual(['세부']);
  });

  it('설명이 없어도 깨지지 않는다', () => {
    const [entry] = toEntries([make({ key: 'x', name: 'X', description: '' })]);
    expect(entry?.summary).toBe('');
    expect(entry?.details).toEqual([]);
  });

  it('캠페인 상태가 같은 key의 시스템 기본을 덮어쓴다', () => {
    const entries = toEntries([
      make({ key: 'exhaustion', name: '탈진', description: '기본 규칙' }),
      make({ key: 'exhaustion', name: '탈진(하우스룰)', campaign_id: 'c1', description: '우리 규칙' }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('탈진(하우스룰)');
    expect(entries[0]?.isCustom).toBe(true);
  });

  it('덮어쓰기는 순서와 무관하게 캠페인 쪽이 이긴다', () => {
    const entries = toEntries([
      make({ key: 'e', name: '캠페인', campaign_id: 'c1' }),
      make({ key: 'e', name: '기본' }),
    ]);
    expect(entries[0]?.name).toBe('캠페인');
  });

  it('캠페인 전용 상태를 먼저 보여준다', () => {
    const entries = toEntries([
      make({ key: 'a', name: '가나다' }),
      make({ key: 'z', name: '하하하', campaign_id: 'c1' }),
    ]);
    expect(entries.map((e) => e.name)).toEqual(['하하하', '가나다']);
  });
});

describe('searchConditions', () => {
  const entries = toEntries([
    make({ key: 'bleed', name: '출혈', description: '턴마다 피해를 받는다.\n스택만큼 아프다.' }),
    make({ key: 'prone', name: '넘어짐', description: '포복만 가능하다.' }),
  ]);

  it('빈 검색어는 전체를 돌려준다', () => {
    expect(searchConditions(entries, '   ')).toHaveLength(2);
  });

  it('이름으로 찾는다', () => {
    expect(searchConditions(entries, '출혈').map((e) => e.key)).toEqual(['bleed']);
  });

  it('세부 규칙 본문으로도 찾는다', () => {
    expect(searchConditions(entries, '포복').map((e) => e.key)).toEqual(['prone']);
  });

  it('영문 key로도 찾는다', () => {
    expect(searchConditions(entries, 'BLEED').map((e) => e.key)).toEqual(['bleed']);
  });
});

describe('findByKey', () => {
  const entries = toEntries([make({ key: 'bleed', name: '출혈' })]);

  it('key로 항목을 찾는다', () => {
    expect(findByKey(entries, 'bleed')?.name).toBe('출혈');
  });

  it('없으면 null', () => {
    expect(findByKey(entries, 'none')).toBeNull();
  });
});
