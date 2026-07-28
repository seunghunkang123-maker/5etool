import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialogHost, confirmAndRun, confirmDialog } from './ConfirmDialog';
import { ToastViewport } from './Toast';

describe('확인 다이얼로그', () => {
  it('확인을 누르면 true를 반환한다', async () => {
    render(<ConfirmDialogHost />);
    const promise = confirmDialog({ title: '삭제할까요?', description: '되돌릴 수 없습니다.' });

    expect(await screen.findByRole('dialog', { name: '삭제할까요?' })).toBeInTheDocument();
    expect(screen.getByText('되돌릴 수 없습니다.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '확인' }));
    await expect(promise).resolves.toBe(true);
  });

  it('취소를 누르면 false를 반환한다', async () => {
    render(<ConfirmDialogHost />);
    const promise = confirmDialog({ title: '삭제할까요?' });
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await expect(promise).resolves.toBe(false);
  });

  it('Escape로 닫으면 취소로 처리한다', async () => {
    render(<ConfirmDialogHost />);
    const promise = confirmDialog({ title: '삭제할까요?' });
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await expect(promise).resolves.toBe(false);
  });

  it('사용자 정의 버튼 문구를 사용한다', async () => {
    render(<ConfirmDialogHost />);
    void confirmDialog({ title: '내보낼까요?', confirmLabel: '내보내기', cancelLabel: '그만두기' });
    expect(await screen.findByRole('button', { name: '내보내기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그만두기' })).toBeInTheDocument();
  });

  it('확인 후 작업을 실행하고 성공 메시지를 보여준다', async () => {
    render(
      <>
        <ConfirmDialogHost />
        <ToastViewport />
      </>,
    );
    const action = vi.fn().mockResolvedValue(undefined);
    void confirmAndRun({ title: '삭제할까요?' }, action, '삭제했습니다.');

    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(await screen.findByText('삭제했습니다.')).toBeInTheDocument();
  });

  it('작업이 실패하면 사용자용 오류 메시지를 보여준다', async () => {
    render(
      <>
        <ConfirmDialogHost />
        <ToastViewport />
      </>,
    );
    void confirmAndRun({ title: '삭제할까요?' }, () => Promise.reject(new Error('boom')));

    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('취소하면 작업을 실행하지 않는다', async () => {
    render(<ConfirmDialogHost />);
    const action = vi.fn();
    void confirmAndRun({ title: '삭제할까요?' }, action);

    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(action).not.toHaveBeenCalled());
  });
});
