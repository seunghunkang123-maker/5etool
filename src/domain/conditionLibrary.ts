import type { Condition } from '@/data/types';

/**
 * 상태 효과 조회용 정리.
 *
 * 시스템 기본 상태와 캠페인 전용 상태를 한 목록으로 합쳐 검색한다.
 * 캠페인이 같은 key로 상태를 만들면 그쪽이 기본을 덮어쓴다
 * (예: "탈진"의 단계 규칙을 캠페인 규칙으로 바꾸는 경우).
 */

export interface ConditionEntry {
  id: string;
  key: string;
  name: string;
  icon: string;
  /** 첫 줄 = 요약, 나머지 = 세부 규칙 */
  summary: string;
  details: string[];
  isStackable: boolean;
  color: string | null;
  /** 이 캠페인에서 추가한 상태인지 */
  isCustom: boolean;
}

function splitDescription(description: string): { summary: string; details: string[] } {
  const lines = description
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { summary: '', details: [] };
  return { summary: lines[0] ?? '', details: lines.slice(1) };
}

export function toEntries(conditions: Condition[]): ConditionEntry[] {
  const byKey = new Map<string, ConditionEntry>();

  for (const condition of conditions) {
    const { summary, details } = splitDescription(condition.description);
    const entry: ConditionEntry = {
      id: condition.id,
      key: condition.key,
      name: condition.name,
      icon: condition.icon,
      summary,
      details,
      isStackable: condition.is_stackable,
      color: condition.color,
      isCustom: condition.campaign_id !== null,
    };
    // 캠페인 상태가 시스템 기본을 덮어쓴다.
    const existing = byKey.get(condition.key);
    if (!existing || entry.isCustom) byKey.set(condition.key, entry);
  }

  return [...byKey.values()].sort((a, b) => {
    // 캠페인 고유 상태를 먼저 보여준다. 세션 중에 찾는 것은 대개 그쪽이다.
    if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

/** 이름·요약·세부 규칙·key를 모두 훑어 검색한다. */
export function searchConditions(entries: ConditionEntry[], query: string): ConditionEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => {
    const haystack = [entry.name, entry.key, entry.summary, ...entry.details].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function findByKey(entries: ConditionEntry[], key: string): ConditionEntry | null {
  return entries.find((entry) => entry.key === key) ?? null;
}
