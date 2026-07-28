import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errors';

/**
 * 자동 저장 + 오프라인 임시 저장.
 *
 * - 입력 중에는 로컬 상태만 사용하고 debounce 후 저장한다.
 * - 저장 전 변경 내용은 localStorage에 임시 보관해 새로고침/네트워크 오류에도 잃지 않는다.
 * - 저장되지 않은 변경이 있으면 브라우저 종료 전에 경고한다.
 */

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline';

export const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  dirty: '저장되지 않은 변경',
  saving: '저장 중',
  saved: '저장 완료',
  error: '저장 실패',
  offline: '오프라인 변경 사항',
};

interface UseAutosaveOptions<T> {
  /** 임시 저장 키 (카드 id 등) */
  draftKey: string;
  value: T;
  onSave: (value: T) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

interface UseAutosaveResult {
  status: SaveStatus;
  error: string | null;
  /** 즉시 저장 (Ctrl+S) */
  saveNow: () => Promise<void>;
  /** 임시 저장본 삭제 */
  clearDraft: () => void;
}

function draftStorageKey(key: string): string {
  return `arcanum:draft:${key}`;
}

export function loadDraft<T>(key: string): { value: T; savedAt: string } | null {
  try {
    const raw = globalThis.localStorage?.getItem(draftStorageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as { value: T; savedAt: string };
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    globalThis.localStorage?.removeItem(draftStorageKey(key));
  } catch {
    /* 무시 */
  }
}

export function useAutosave<T>({ draftKey, value, onSave, delay = 1200, enabled = true }: UseAutosaveOptions<T>): UseAutosaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(value));
  const valueRef = useRef(value);
  valueRef.current = value;

  const persistDraft = useCallback(
    (next: T) => {
      try {
        globalThis.localStorage?.setItem(draftStorageKey(draftKey), JSON.stringify({ value: next, savedAt: new Date().toISOString() }));
      } catch {
        /* 용량 초과 등은 무시 */
      }
    },
    [draftKey],
  );

  const runSave = useCallback(async () => {
    const snapshot = valueRef.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSaved.current) return;

    setStatus('saving');
    setError(null);
    try {
      await onSave(snapshot);
      lastSaved.current = serialized;
      clearDraft(draftKey);
      setStatus('saved');
    } catch (err) {
      persistDraft(snapshot);
      setError(toUserMessage(err));
      setStatus(navigator.onLine === false ? 'offline' : 'error');
    }
  }, [onSave, draftKey, persistDraft]);

  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return;

    setStatus('dirty');
    persistDraft(value);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSave(), delay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, delay, enabled, runSave, persistDraft]);

  // 화면을 닫을 때 아직 저장되지 않은 변경이 있으면 즉시 저장한다.
  // (debounce 타이머가 언마운트로 취소되어 변경이 사라지는 것을 막는다.)
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;
  useEffect(() => {
    return () => {
      if (JSON.stringify(valueRef.current) !== lastSaved.current) {
        void runSaveRef.current();
      }
    };
  }, []);

  // 저장되지 않은 변경이 있으면 페이지를 떠날 때 경고한다.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (status === 'dirty' || status === 'saving' || status === 'error' || status === 'offline') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [status]);

  return {
    status,
    error,
    saveNow: runSave,
    clearDraft: () => clearDraft(draftKey),
  };
}
