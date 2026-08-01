import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from 'react';

/**
 * 한글 입력(IME) 중에 커서가 튀는 것을 막는다.
 *
 * 한글은 자모를 모아 한 글자를 만드는 동안(조합 중) 브라우저가 입력칸에 미완성
 * 글자를 들고 있다. 이때 React가 제어 컴포넌트의 value를 바깥 상태로 되돌리면
 * 조합이 끊기고 커서가 맨 뒤나 맨 앞으로 튄다. 화면을 다시 그리는 데 시간이
 * 걸리는 휴대폰에서 특히 심하다.
 *
 * 조합이 진행되는 동안에는 입력칸이 들고 있는 값을 그대로 두고(바깥으로 알리지
 * 않는다), 글자가 완성되면 그때 한 번만 바깥에 알린다.
 *
 * 조합을 쓰지 않는 입력(영문·숫자)은 예전과 똑같이 글자마다 바로 전달된다.
 */
export function useImeInput<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: unknown,
  onChange: ((event: ChangeEvent<T>) => void) | undefined,
) {
  const composing = useRef(false);
  // 조합 중에 화면에 보여 줄 값. null이면 바깥 값을 그대로 쓴다.
  const [buffer, setBuffer] = useState<string | null>(null);

  // 바깥 값이 조합 결과를 따라잡으면 버퍼를 놓아준다.
  useEffect(() => {
    if (buffer !== null && String(value ?? '') === buffer) setBuffer(null);
  }, [value, buffer]);

  // 제어 컴포넌트가 아니면(값이나 onChange가 없으면) 손대지 않는다.
  if (value === undefined || !onChange) return {};

  return {
    value: buffer ?? (value as string | number | readonly string[]),
    onChange: (event: ChangeEvent<T>) => {
      if (composing.current) {
        // 조합 중에는 입력칸이 가진 값을 그대로 보여 주기만 한다.
        setBuffer(event.target.value);
        return;
      }
      setBuffer(null);
      onChange(event);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (event: CompositionEvent<T>) => {
      composing.current = false;
      const target = event.target as T;
      // 완성된 글자를 화면에 유지한 채 바깥에 알린다.
      // (바깥 값이 갱신되면 위 useEffect가 버퍼를 지운다.)
      setBuffer(target.value);
      onChange({ ...event, target, currentTarget: target } as unknown as ChangeEvent<T>);
    },
  };
}
