import { describe, expect, it } from 'vitest';
import type { Timer } from '@/data/types';
import { adjustPatch, displayMs, elapsedMs, formatDuration, isExpired, pausePatch, remainingMs, resetPatch, startPatch } from './timer';

const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

function timer(overrides: Partial<Timer> = {}): Timer {
  return {
    id: 't1',
    session_id: 's1',
    name: '테스트 타이머',
    description: '',
    kind: 'countdown',
    duration_seconds: 60,
    ends_at: null,
    started_at: null,
    paused_remaining_ms: null,
    elapsed_ms: 0,
    state: 'idle',
    is_shared: true,
    end_message: '',
    sound_on_end: false,
    created_by: 'u1',
    created_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('remainingMs', () => {
  it('대기 상태에서는 설정 시간을 그대로 보여준다', () => {
    expect(remainingMs(timer({ duration_seconds: 90 }), NOW)).toBe(90_000);
  });

  it('실행 중에는 종료 예정 시각을 기준으로 계산한다', () => {
    const t = timer({ state: 'running', ends_at: new Date(NOW + 30_000).toISOString() });
    expect(remainingMs(t, NOW)).toBe(30_000);
    expect(remainingMs(t, NOW + 10_000)).toBe(20_000);
  });

  it('종료 시각을 지나도 음수가 되지 않는다', () => {
    const t = timer({ state: 'running', ends_at: new Date(NOW).toISOString() });
    expect(remainingMs(t, NOW + 60_000)).toBe(0);
  });

  it('일시 정지 중에는 저장된 남은 시간을 쓴다', () => {
    expect(remainingMs(timer({ state: 'paused', paused_remaining_ms: 12_345 }), NOW + 999_999)).toBe(12_345);
  });

  it('새로고침(다른 now 값)에도 같은 결과를 낸다', () => {
    const t = timer({ state: 'running', ends_at: new Date(NOW + 45_000).toISOString() });
    expect(remainingMs(t, NOW + 5_000)).toBe(40_000);
    expect(remainingMs(t, NOW + 5_000)).toBe(40_000);
  });
});

describe('elapsedMs', () => {
  it('스톱워치는 시작 시각부터 경과 시간을 센다', () => {
    const t = timer({ kind: 'stopwatch', state: 'running', started_at: new Date(NOW).toISOString() });
    expect(elapsedMs(t, NOW + 7_000)).toBe(7_000);
  });

  it('일시 정지된 경과 시간에 누적한다', () => {
    const t = timer({ kind: 'stopwatch', state: 'running', started_at: new Date(NOW).toISOString(), elapsed_ms: 3_000 });
    expect(elapsedMs(t, NOW + 2_000)).toBe(5_000);
  });
});

describe('displayMs / isExpired', () => {
  it('종류에 맞는 값을 반환한다', () => {
    expect(displayMs(timer({ duration_seconds: 30 }), NOW)).toBe(30_000);
    expect(displayMs(timer({ kind: 'stopwatch', elapsed_ms: 4_000 }), NOW)).toBe(4_000);
  });

  it('실행 중 카운트다운이 끝나면 만료로 판정한다', () => {
    const t = timer({ state: 'running', ends_at: new Date(NOW).toISOString() });
    expect(isExpired(t, NOW - 1)).toBe(false);
    expect(isExpired(t, NOW + 1)).toBe(true);
  });
});

describe('formatDuration', () => {
  it('분:초 형태로 표시한다', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(599_000)).toBe('09:59');
  });

  it('한 시간 이상이면 시간을 포함한다', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('음수는 0으로 처리한다', () => {
    expect(formatDuration(-5_000)).toBe('00:00');
  });
});

describe('상태 전이 패치', () => {
  it('시작하면 종료 예정 시각을 절대 시각으로 저장한다', () => {
    const patch = startPatch(timer({ duration_seconds: 30 }), NOW);
    expect(patch.state).toBe('running');
    expect(patch.ends_at).toBe(new Date(NOW + 30_000).toISOString());
  });

  it('일시 정지에서 재개하면 남은 시간만큼만 이어간다', () => {
    const patch = startPatch(timer({ state: 'paused', paused_remaining_ms: 5_000 }), NOW);
    expect(patch.ends_at).toBe(new Date(NOW + 5_000).toISOString());
  });

  it('일시 정지하면 남은 시간을 저장하고 종료 시각을 비운다', () => {
    const patch = pausePatch(timer({ state: 'running', ends_at: new Date(NOW + 8_000).toISOString() }), NOW);
    expect(patch).toMatchObject({ state: 'paused', paused_remaining_ms: 8_000, ends_at: null });
  });

  it('초기화하면 모든 진행 상태를 지운다', () => {
    expect(resetPatch()).toMatchObject({ state: 'idle', ends_at: null, elapsed_ms: 0 });
  });

  it('실행 중 시간 추가는 종료 예정 시각을 옮긴다', () => {
    const patch = adjustPatch(timer({ state: 'running', ends_at: new Date(NOW + 10_000).toISOString() }), 30, NOW);
    expect(patch.ends_at).toBe(new Date(NOW + 40_000).toISOString());
  });

  it('대기 중 시간 가감은 설정 시간을 바꾼다', () => {
    expect(adjustPatch(timer({ duration_seconds: 60 }), -30, NOW).duration_seconds).toBe(30);
  });
});
