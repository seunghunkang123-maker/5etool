import { useEffect, useRef } from 'react';

/**
 * 키보드 단축키.
 * 입력 중(input/textarea/contenteditable)에는 단일 키 단축키가 작동하지 않는다.
 */

export interface ShortcutSpec {
  /** 예: 'mod+k', 'n', 'space', 'mod+enter' */
  combo: string;
  handler: (event: KeyboardEvent) => void;
  /** 입력 중에도 실행할지 (mod 조합에만 권장) */
  allowInInput?: boolean;
  description?: string;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

/**
 * Space/Enter는 버튼·링크를 활성화하는 키이기도 하다.
 * 포커스가 그런 요소에 있을 때 전역 단축키가 가로채면 키보드 사용자가 버튼을 누를 수 없다.
 */
function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'button' || tag === 'a' || tag === 'summary') return true;
  const role = target.getAttribute('role');
  return role === 'button' || role === 'link' || role === 'checkbox' || role === 'tab' || role === 'menuitem';
}

function matches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1] ?? '';
  const needsMod = parts.includes('mod');
  const needsShift = parts.includes('shift');
  const needsAlt = parts.includes('alt');

  const mod = event.metaKey || event.ctrlKey;
  if (needsMod !== mod) return false;
  if (needsAlt !== event.altKey) return false;
  // '?'는 키보드 배열에 따라 Shift가 필요하기도 하고 아니기도 하다. Shift 조건을 따지지 않는다.
  if (key !== '?' && needsShift !== event.shiftKey) return false;

  const eventKey = event.key.toLowerCase();
  if (key === 'space') return eventKey === ' ' || event.code === 'Space';
  if (key === 'enter') return eventKey === 'enter';
  if (key === 'escape') return eventKey === 'escape';
  return eventKey === key;
}

export function useShortcuts(shortcuts: ShortcutSpec[], enabled = true): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const editing = isEditableTarget(event.target);
      const activatable = isActivatableTarget(event.target);
      for (const shortcut of ref.current) {
        if (!matches(shortcut.combo, event)) continue;
        if (editing && !shortcut.allowInInput) continue;
        // 수식 키 없는 Space/Enter는 버튼 조작을 방해하지 않는다.
        const bare = !shortcut.combo.includes('mod');
        if (activatable && bare && (event.key === ' ' || event.key === 'Enter')) continue;
        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

export const SHORTCUT_HELP: { keys: string; description: string }[] = [
  { keys: 'Ctrl/Cmd + K', description: '통합 검색 열기' },
  { keys: 'Ctrl/Cmd + S', description: '현재 카드 저장' },
  { keys: 'N', description: '새 카드 만들기' },
  { keys: 'T', description: '타이머 패널' },
  { keys: 'I', description: '이니셔티브 패널' },
  { keys: 'Space', description: '타이머 시작 / 일시 정지' },
  { keys: 'Ctrl/Cmd + Enter', description: '선택한 자료 공개' },
  { keys: '?', description: '단축키 도움말' },
  { keys: 'Esc', description: '다이얼로그 닫기' },
];
