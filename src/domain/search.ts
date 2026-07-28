import type { Card, CardType, RevealScope, UUID } from '@/data/types';
import { docToPlainText } from './sanitize';

/**
 * 카드 통합 검색 / 필터.
 * 로컬 어댑터와 클라이언트 측 필터링에 사용하며,
 * Supabase 어댑터에서는 tsvector 검색 + 인덱스로 같은 의미를 구현한다.
 */

export interface CardFilter {
  query?: string;
  types?: CardType[];
  folderId?: UUID | null;
  /** 하위 폴더까지 포함 */
  includeDescendants?: boolean;
  tagIds?: UUID[];
  revealScopes?: RevealScope[];
  createdBy?: UUID;
  favoritesOnly?: boolean;
  updatedAfter?: string;
  includeArchived?: boolean;
  /** DM 메모까지 검색 대상에 포함 (DM 권한자만) */
  includeDmNotes?: boolean;
  usedInSessionCardIds?: UUID[];
}

export function normalizeQuery(query: string): string[] {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function haystackFor(card: Card, includeDmNotes: boolean): string {
  const parts = [card.name, card.summary, docToPlainText(card.body)];
  if (card.stats) parts.push(card.stats.type, card.stats.size, card.stats.cr, card.stats.languages);
  if (card.sections) card.sections.forEach((s) => parts.push(s.name, s.description));
  if (includeDmNotes) parts.push(card.dm_notes);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/** 폴더 트리에서 특정 폴더의 하위 폴더 id를 모두 모은다. */
export function descendantFolderIds(
  folders: readonly { id: UUID; parent_id: UUID | null }[],
  rootId: UUID,
): UUID[] {
  const byParent = new Map<UUID | null, UUID[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parent_id) ?? [];
    list.push(folder.id);
    byParent.set(folder.parent_id, list);
  }
  const result: UUID[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    result.push(current);
    for (const child of byParent.get(current) ?? []) stack.push(child);
  }
  return result;
}

export function filterCards(
  cards: readonly Card[],
  filter: CardFilter,
  folders: readonly { id: UUID; parent_id: UUID | null }[] = [],
): Card[] {
  const tokens = normalizeQuery(filter.query ?? '');
  const folderScope =
    filter.folderId && filter.includeDescendants
      ? new Set(descendantFolderIds(folders, filter.folderId))
      : null;

  return cards.filter((card) => {
    if (card.deleted_at) return false;
    if (!filter.includeArchived && card.is_archived) return false;

    if (filter.types && filter.types.length > 0 && !filter.types.includes(card.type)) return false;

    if (filter.folderId !== undefined) {
      if (filter.folderId === null) {
        if (card.folder_id !== null) return false;
      } else if (folderScope) {
        if (!card.folder_id || !folderScope.has(card.folder_id)) return false;
      } else if (card.folder_id !== filter.folderId) {
        return false;
      }
    }

    if (filter.tagIds && filter.tagIds.length > 0) {
      const cardTags = card.tag_ids ?? [];
      if (!filter.tagIds.every((t) => cardTags.includes(t))) return false;
    }

    if (filter.revealScopes && filter.revealScopes.length > 0 && !filter.revealScopes.includes(card.reveal_scope)) {
      return false;
    }

    if (filter.createdBy && card.created_by !== filter.createdBy) return false;
    if (filter.favoritesOnly && !card.is_favorite) return false;
    if (filter.updatedAfter && card.updated_at < filter.updatedAfter) return false;
    if (filter.usedInSessionCardIds && !filter.usedInSessionCardIds.includes(card.id)) return false;

    if (tokens.length > 0) {
      const haystack = haystackFor(card, filter.includeDmNotes === true);
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

/** 검색어 관련도 순 정렬 — 이름 일치 > 요약 일치 > 최근 수정 */
export function rankCards(cards: readonly Card[], query: string): Card[] {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) {
    return [...cards].sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'ko'));
  }
  const score = (card: Card): number => {
    const name = card.name.toLowerCase();
    let value = 0;
    for (const token of tokens) {
      if (name === token) value += 100;
      else if (name.startsWith(token)) value += 50;
      else if (name.includes(token)) value += 25;
      else if (card.summary.toLowerCase().includes(token)) value += 10;
      else value += 1;
    }
    if (card.is_favorite) value += 5;
    return value;
  };
  return [...cards].sort((a, b) => score(b) - score(a) || b.updated_at.localeCompare(a.updated_at));
}

const RECENT_SEARCH_KEY = 'arcanum:recent-searches';
const MAX_RECENT = 10;

export function loadRecentSearches(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return loadRecentSearches();
  const next = [trimmed, ...loadRecentSearches().filter((q) => q !== trimmed)].slice(0, MAX_RECENT);
  try {
    globalThis.localStorage?.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패는 조용히 무시한다(프라이빗 모드 등).
  }
  return next;
}
