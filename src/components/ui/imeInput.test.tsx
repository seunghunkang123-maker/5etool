import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Input, Textarea } from './Field';

/**
 * 한글 조합 중 커서 튐 방지.
 *
 * 한글은 자모를 모으는 동안 입력칸이 미완성 글자를 들고 있다. 이때 제어
 * 컴포넌트의 value를 바깥 상태로 되돌리면 조합이 끊기고 커서가 튄다.
 * 조합이 끝날 때까지 바깥에 알리지 않아야 한다.
 */

/** 바깥 상태를 실제로 들고 있는 부모. 진짜 제어 컴포넌트 상황을 만든다. */
function Controlled({ onValue }: { onValue?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Input
      aria-label="이름"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onValue?.(e.target.value);
      }}
    />
  );
}

describe('IME 입력', () => {
  it('조합 중에는 바깥으로 값을 올리지 않는다', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('이름') as HTMLInputElement;

    fireEvent.compositionStart(input);
    // "한" 을 만드는 중: ㅎ → 하 → 한
    for (const step of ['ㅎ', '하', '한']) {
      fireEvent.change(input, { target: { value: step } });
    }

    // 아직 조합 중이므로 바깥 상태는 건드리지 않는다.
    expect(onValue).not.toHaveBeenCalled();
    // 입력칸에는 조합 중인 글자가 그대로 남아 있어야 한다(커서가 튀지 않는 조건).
    expect(input.value).toBe('한');
  });

  it('조합이 끝나면 완성된 글자를 한 번만 올린다', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('이름') as HTMLInputElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'ㅎ' } });
    fireEvent.change(input, { target: { value: '한' } });
    fireEvent.compositionEnd(input, { target: { value: '한' } });

    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith('한');
    expect(input.value).toBe('한');
  });

  it('조합을 쓰지 않는 입력은 글자마다 그대로 전달한다', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('이름') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });

    expect(onValue).toHaveBeenNthCalledWith(1, 'a');
    expect(onValue).toHaveBeenNthCalledWith(2, 'ab');
    expect(input.value).toBe('ab');
  });

  it('조합이 끝난 뒤 이어서 입력해도 값이 이어진다', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('이름') as HTMLInputElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '한' } });
    fireEvent.compositionEnd(input, { target: { value: '한' } });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '한구' } });
    fireEvent.change(input, { target: { value: '한국' } });
    fireEvent.compositionEnd(input, { target: { value: '한국' } });

    expect(input.value).toBe('한국');
  });

  it('여러 줄 입력칸도 같은 규칙을 따른다', () => {
    function ControlledArea() {
      const [value, setValue] = useState('');
      return <Textarea aria-label="설명" value={value} onChange={(e) => setValue(e.target.value)} />;
    }
    render(<ControlledArea />);
    const area = screen.getByLabelText('설명') as HTMLTextAreaElement;

    fireEvent.compositionStart(area);
    fireEvent.change(area, { target: { value: '설' } });
    expect(area.value).toBe('설');
    fireEvent.compositionEnd(area, { target: { value: '설명' } });
    expect(area.value).toBe('설명');
  });
});
