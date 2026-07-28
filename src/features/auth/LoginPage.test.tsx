import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { renderWithProviders, seedDemoUser } from '@/test/utils';
import { localStore } from '@/data/local/store';
import { useAuthStore } from '@/stores/auth';

describe('로그인 화면', () => {
  beforeEach(() => {
    localStore.reset();
    useAuthStore.setState({ user: null, profile: null, loading: false });
  });

  it('이메일과 비밀번호 입력을 제공한다', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('빈 값으로 제출하면 오류 메시지를 필드에 연결해 표시한다', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    const message = await screen.findByText('이메일을 입력해 주세요.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-invalid', 'true');
  });

  it('형식이 잘못된 이메일을 거부한다', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'test-password');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('이메일 형식이 올바르지 않습니다.')).toBeInTheDocument();
  });

  it('잘못된 자격 증명에 사용자용 한국어 메시지를 보여준다', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'nobody@test.local');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
  });

  it('올바른 자격 증명으로 로그인한다', async () => {
    await seedDemoUser('dm@test.local', 'test-password');
    await useAuthStore.getState().signOut();

    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('이메일'), 'dm@test.local');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'test-password');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await waitFor(() => {
      expect(localStore.getCurrentUserId()).not.toBeNull();
    });
  });
});
