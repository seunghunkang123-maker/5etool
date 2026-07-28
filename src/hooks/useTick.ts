import { useEffect, useState } from 'react';

/**
 * 일정 간격으로 리렌더를 유발하는 훅.
 * 타이머 표시에만 사용해, 매초 렌더링이 화면 전체로 번지지 않게 한다.
 */
export function useTick(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    // 탭이 다시 보이면 즉시 시각을 맞춘다(백그라운드에서 타이머가 느려지는 문제 대응).
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, active]);

  return now;
}
