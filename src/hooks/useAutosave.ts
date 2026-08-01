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
  // 저장을 한 번에 하나만 보낸다.
  // 두 저장이 겹치면 둘 다 같은 버전 번호를 들고 나가서, 나중 것이 낙관적 잠금에
  // 걸려 "다른 사용자가 먼저 내용을 수정했습니다"로 잘못 보고된다.
  const inFlight = useRef(false);
  const queued = useRef(false);

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

  /**
   * 임시 저장을 글자마다 하지 않는다.
   *
   * localStorage 쓰기는 메인 스레드를 막는 동기 작업이라, 키를 누를 때마다 전체
   * 상태를 직렬화해 쓰면 휴대폰에서 입력이 밀리고 한글 조합이 끊겨 커서가 튄다.
   * 잠깐 쉬는 순간에 한 번만 쓴다. 저장에 실패할 때는 아래에서 즉시 한 번 더 쓴다.
   */
  const draftTimer = useRef<number | null>(null);
  const persistDraftSoon = useCallback(
    (next: T) => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => persistDraft(next), 400);
    },
    [persistDraft],
  );

  useEffect(() => () => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
  }, []);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const runSave = useCallback(async () => {
    // 이미 저장 중이면 새로 보내지 않고, 끝난 뒤 한 번 더 돌도록 표시만 한다.
    if (inFlight.current) {
      queued.current = true;
      return;
    }

    const snapshot = valueRef.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSaved.current) return;

    inFlight.current = true;
    setStatus('saving');
    setError(null);
    try {
      await onSaveRef.current(snapshot);
      lastSaved.current = serialized;
      clearDraft(draftKey);
      setStatus('saved');
    } catch (err) {
      persistDraft(snapshot);
      setError(toUserMessage(err));
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      // 실패했으면 밀린 저장을 자동으로 다시 보내지 않는다.
      // 같은 오류를 반복해서 띄우기만 하기 때문이다.
      queued.current = false;
    } finally {
      inFlight.current = false;
    }

    // 저장하는 동안 값이 또 바뀌었으면 이어서 한 번 더 저장한다.
    if (queued.current) {
      queued.current = false;
      if (JSON.stringify(valueRef.current) !== lastSaved.current) await runSaveRef.current();
    }
  }, [draftKey, persistDraft]);

  // runSave가 자기 자신을 다시 부를 수 있게 참조로 들고 있는다.
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;

  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastSaved.current) return;

    setStatus('dirty');
    persistDraftSoon(value);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSave(), delay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, delay, enabled, runSave, persistDraftSoon]);

  // 화면을 닫을 때 아직 저장되지 않은 변경이 있으면 즉시 저장한다.
  // (debounce 타이머가 언마운트로 취소되어 변경이 사라지는 것을 막는다.)
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
