import type { Timer } from '@/data/types';

/**
 * 타이머는 절대 시각(ends_at / started_at)만 저장하고 남은 시간은 클라이언트가 계산한다.
 * → 매초 DB 쓰기가 없고, 새로고침·백그라운드 탭에서도 시간이 정확하다.
 */

/** 카운트다운 타이머의 남은 시간(ms). 0 미만으로 내려가지 않는다. */
export function remainingMs(timer: Pick<Timer, 'kind' | 'state' | 'ends_at' | 'paused_remaining_ms' | 'duration_seconds'>, now: number = Date.now()): number {
  if (timer.kind !== 'countdown') return 0;
  switch (timer.state) {
    case 'running': {
      if (!timer.ends_at) return 0;
      return Math.max(0, new Date(timer.ends_at).getTime() - now);
    }
    case 'paused':
      return Math.max(0, timer.paused_remaining_ms ?? 0);
    case 'finished':
      return 0;
    case 'idle':
    default:
      return Math.max(0, timer.duration_seconds * 1000);
  }
}

/** 스톱워치의 경과 시간(ms). */
export function elapsedMs(timer: Pick<Timer, 'kind' | 'state' | 'started_at' | 'elapsed_ms'>, now: number = Date.now()): number {
  if (timer.kind !== 'stopwatch') return 0;
  if (timer.state === 'running' && timer.started_at) {
    return Math.max(0, timer.elapsed_ms + (now - new Date(timer.started_at).getTime()));
  }
  return Math.max(0, timer.elapsed_ms);
}

/** 타이머가 표시해야 할 시간(ms) — 종류에 따라 남은 시간 또는 경과 시간 */
export function displayMs(timer: Timer, now: number = Date.now()): number {
  return timer.kind === 'countdown' ? remainingMs(timer, now) : elapsedMs(timer, now);
}

/** 실행 중인 카운트다운이 종료 시각을 지났는가 */
export function isExpired(timer: Timer, now: number = Date.now()): boolean {
  return timer.kind === 'countdown' && timer.state === 'running' && remainingMs(timer, now) <= 0;
}

/** ms → "12:34" 또는 "1:02:03" */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** 시작 시 저장할 필드 계산 */
export function startPatch(timer: Timer, now: number = Date.now()): Partial<Timer> {
  if (timer.kind === 'countdown') {
    const remaining = timer.state === 'paused' ? (timer.paused_remaining_ms ?? 0) : timer.duration_seconds * 1000;
    return {
      state: 'running',
      ends_at: new Date(now + remaining).toISOString(),
      paused_remaining_ms: null,
    };
  }
  return { state: 'running', started_at: new Date(now).toISOString() };
}

/** 일시 정지 시 저장할 필드 계산 */
export function pausePatch(timer: Timer, now: number = Date.now()): Partial<Timer> {
  if (timer.kind === 'countdown') {
    return { state: 'paused', paused_remaining_ms: remainingMs(timer, now), ends_at: null };
  }
  return { state: 'paused', elapsed_ms: elapsedMs(timer, now), started_at: null };
}

/** 초기화 시 저장할 필드 계산 */
export function resetPatch(): Partial<Timer> {
  return { state: 'idle', ends_at: null, started_at: null, paused_remaining_ms: null, elapsed_ms: 0 };
}

/** 시간 가감(초). 실행 중이면 종료 예정 시각을 옮긴다. */
export function adjustPatch(timer: Timer, deltaSeconds: number, now: number = Date.now()): Partial<Timer> {
  const deltaMs = Math.floor(deltaSeconds * 1000);
  if (timer.kind !== 'countdown') {
    return { elapsed_ms: Math.max(0, elapsedMs(timer, now) + deltaMs) };
  }
  if (timer.state === 'running' && timer.ends_at) {
    const next = Math.max(now, new Date(timer.ends_at).getTime() + deltaMs);
    return { ends_at: new Date(next).toISOString() };
  }
  if (timer.state === 'paused') {
    return { paused_remaining_ms: Math.max(0, (timer.paused_remaining_ms ?? 0) + deltaMs) };
  }
  return { duration_seconds: Math.max(0, timer.duration_seconds + deltaSeconds) };
}
