import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORTCUT_HELP, useShortcuts } from './useShortcuts';

/**
 * 단축키 규칙 검증.
 * - 글을 쓰는 중에는 단일 키 단축키가 동작하지 않는다.
 * - Space/Enter는 버튼 조작을 가로채지 않는다.
 */

function press(init: KeyboardEventInit & { target?: Element }) {
  const { target, ...rest } = init;
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...rest });
  (target ?? document.body).dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useShortcuts', () => {
  it('단일 키 단축키를 실행한다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'n', handler }]));
    press({ key: 'n' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('입력란에 글을 쓰는 중에는 단일 키 단축키가 동작하지 않는다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'n', handler }]));

    const input = document.createElement('input');
    document.body.appendChild(input);
    press({ key: 'n', target: input });
    expect(handler).not.toHaveBeenCalled();
  });

  it('allowInInput이면 입력 중에도 동작한다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'mod+s', allowInInput: true, handler }]));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    press({ key: 's', ctrlKey: true, target: textarea });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('수식 키가 필요한 단축키는 수식 키 없이 실행되지 않는다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'mod+k', handler }]));
    press({ key: 'k' });
    expect(handler).not.toHaveBeenCalled();
    press({ key: 'k', metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Enter와 Enter를 구분한다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'mod+enter', handler }]));
    press({ key: 'Enter' });
    expect(handler).not.toHaveBeenCalled();
    press({ key: 'Enter', ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('물음표는 Shift 여부와 관계없이 인식한다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: '?', handler }]));
    press({ key: '?', shiftKey: true });
    press({ key: '?' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('버튼에 포커스가 있으면 Space 단축키가 버튼 조작을 가로채지 않는다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'space', handler }]));

    const button = document.createElement('button');
    document.body.appendChild(button);
    const event = press({ key: ' ', target: button });
    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    press({ key: ' ' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('enabled가 false이면 아무것도 실행하지 않는다', () => {
    const handler = vi.fn();
    renderHook(() => useShortcuts([{ combo: 'n', handler }], false));
    press({ key: 'n' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('도움말 목록에 안내된 단축키에는 빈 항목이 없다', () => {
    expect(SHORTCUT_HELP.length).toBeGreaterThan(0);
    for (const item of SHORTCUT_HELP) {
      expect(item.keys.trim()).not.toBe('');
      expect(item.description.trim()).not.toBe('');
    }
  });
});
