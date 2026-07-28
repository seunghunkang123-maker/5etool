import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { Button } from './Button';

describe('Dialog 접근성', () => {
  const open = (onClose = vi.fn()) =>
    render(
      <Dialog open onClose={onClose} title="테스트 다이얼로그" description="설명입니다">
        <input aria-label="첫 번째 입력" />
        <Button>가운데 버튼</Button>
        <input aria-label="마지막 입력" />
      </Dialog>,
    );

  it('role="dialog"와 aria-modal을 제공한다', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: '테스트 다이얼로그' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('제목과 설명을 스크린 리더에 연결한다', () => {
    open();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('설명입니다');
  });

  it('Escape로 닫힌다', async () => {
    const onClose = vi.fn();
    open(onClose);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼으로 닫힌다', async () => {
    const onClose = vi.fn();
    open(onClose);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('포커스가 다이얼로그 밖으로 나가지 않는다', async () => {
    open();
    const dialog = screen.getByRole('dialog');
    screen.getByLabelText('마지막 입력').focus();

    // 앞으로 여러 번 이동해도 포커스는 다이얼로그 안에 머문다.
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    // 뒤로 이동할 때도 마찬가지다.
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('열릴 때 다이얼로그 내부로 포커스를 옮긴다', async () => {
    open();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('닫혀 있으면 아무것도 렌더링하지 않는다', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="숨김">
        <p>내용</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
