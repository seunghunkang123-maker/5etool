import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './useAutosave';

/**
 * 자동 저장이 겹치지 않는지 확인한다.
 *
 * 저장이 겹치면 둘 다 같은 버전 번호를 들고 나가 나중 것이 낙관적 잠금에 걸리고,
 * 화면에는 "다른 사용자가 먼저 내용을 수정했습니다"가 잘못 뜬다.
 * 몬스터 행동을 서식 편집기로 고칠 때(키 입력마다 값이 바뀔 때) 특히 자주 났다.
 */
describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.localStorage?.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 저장이 끝나기 전에 값이 계속 바뀌는 상황을 만든다. */
  function setup(saveDelayMs: number) {
    let inFlight = 0;
    let maxConcurrent = 0;
    const calls: string[] = [];

    const onSave = vi.fn(async (value: { text: string }) => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      calls.push(value.text);
      await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      inFlight -= 1;
    });

    return { onSave, calls, get maxConcurrent() { return maxConcurrent; } };
  }

  it('저장이 진행 중이면 새 저장을 겹쳐 보내지 않는다', async () => {
    // 저장에 3초가 걸리는데 debounce는 1.2초다. 예전에는 여기서 두 번째 저장이
    // 첫 번째가 끝나기도 전에 나가 충돌이 났다.
    const probe = setup(3000);
    const { rerender } = renderHook(({ value }) => useAutosave({ draftKey: 'test', value, onSave: probe.onSave, delay: 100 }), {
      initialProps: { value: { text: 'a' } },
    });

    rerender({ value: { text: 'ab' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    // 저장이 도는 동안 값이 계속 바뀐다.
    for (const text of ['abc', 'abcd', 'abcde']) {
      rerender({ value: { text } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
    }

    expect(probe.maxConcurrent).toBe(1);

    // 첫 저장이 끝나면 밀린 최신 값을 한 번 더 보낸다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(probe.maxConcurrent).toBe(1);
    expect(probe.calls[0]).toBe('ab');
    expect(probe.calls.at(-1)).toBe('abcde');
  });

  it('바뀐 값이 없으면 저장하지 않는다', async () => {
    const probe = setup(10);
    const { rerender } = renderHook(({ value }) => useAutosave({ draftKey: 'test2', value, onSave: probe.onSave, delay: 100 }), {
      initialProps: { value: { text: 'a' } },
    });

    rerender({ value: { text: 'a' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(probe.onSave).not.toHaveBeenCalled();
  });

  it('저장에 실패하면 상태를 error로 두고 자동으로 다시 보내지 않는다', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result, rerender } = renderHook(
      ({ value }) => useAutosave({ draftKey: 'test3', value, onSave, delay: 100 }),
      { initialProps: { value: { text: 'a' } } },
    );

    rerender({ value: { text: 'ab' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('error');
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
