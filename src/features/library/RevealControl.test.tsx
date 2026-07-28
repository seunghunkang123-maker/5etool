import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RevealDialog } from './RevealControl';
import { renderWithProviders } from '@/test/utils';
import { localStore } from '@/data/local/store';
import { repo } from '@/data';
import type { Card } from '@/data/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    campaign_id: 'camp-1',
    folder_id: null,
    type: 'monster',
    name: '얼음 기사',
    summary: '',
    body: null,
    image_url: null,
    reveal_scope: 'hidden',
    reveal_fields: ['name', 'image'],
    reveal_targets: [],
    is_temporary_reveal: false,
    previous_scope: null,
    is_favorite: false,
    is_archived: false,
    sort_order: 0,
    dm_notes: '',
    created_by: 'dm',
    version: 1,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('카드 공개 설정 다이얼로그', () => {
  beforeEach(async () => {
    localStore.reset();
    await repo().auth.signUp('dm@test.local', 'test-password', 'DM');
  });

  it('공개 범위 선택지를 모두 제공한다', () => {
    renderWithProviders(<RevealDialog card={makeCard()} campaignId="camp-1" onClose={vi.fn()} onSubmit={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: '공개 범위' });
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['비공개', '이름만 공개', '이미지만 공개', '일부 공개', '전체 공개']);
  });

  it('선택한 범위에 대한 설명을 보여준다', async () => {
    renderWithProviders(<RevealDialog card={makeCard()} campaignId="camp-1" onClose={vi.fn()} onSubmit={vi.fn()} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '공개 범위' }), 'name_only');
    expect(screen.getByText('플레이어는 카드 이름과 유형만 봅니다.')).toBeInTheDocument();
  });

  it('일부 공개를 고르면 필드 목록이 나타난다', async () => {
    renderWithProviders(<RevealDialog card={makeCard()} campaignId="camp-1" onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('group', { name: '공개할 필드' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '공개 범위' }), 'partial');
    const fieldset = screen.getByRole('group', { name: '공개할 필드' });
    expect(fieldset).toBeInTheDocument();
    expect(screen.getByLabelText('현재 HP')).toBeInTheDocument();
    expect(screen.getByLabelText('최대 HP')).toBeInTheDocument();
  });

  it('선택한 필드만 담아 제출한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<RevealDialog card={makeCard()} campaignId="camp-1" onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '공개 범위' }), 'partial');
    await userEvent.click(screen.getByLabelText('현재 HP'));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0]?.[0] as { scope: string; fields: string[] };
    expect(payload.scope).toBe('partial');
    expect(payload.fields).toContain('hp_current');
    expect(payload.fields).not.toContain('hp_max');
  });

  it('일시 공개를 선택해 제출한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<RevealDialog card={makeCard()} campaignId="camp-1" onClose={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText(/이번 세션에만 공개/));
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect((onSubmit.mock.calls[0]?.[0] as { temporary: boolean }).temporary).toBe(true);
  });

  it('취소하면 제출하지 않는다', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<RevealDialog card={makeCard()} campaignId="camp-1" onClose={onClose} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
