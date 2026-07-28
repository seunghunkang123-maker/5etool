import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HpBar } from './HpBar';

describe('HpBar', () => {
  it('수치와 부상 단계를 함께 표시한다 (색상에만 의존하지 않음)', () => {
    render(<HpBar hp={30} maxHp={100} />);
    expect(screen.getByText('중상')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAccessibleName('HP 30 / 100 — 중상');
  });

  it('임시 HP를 표시한다', () => {
    render(<HpBar hp={20} maxHp={20} tempHp={5} />);
    expect(screen.getByRole('meter')).toHaveAccessibleName('HP 20 / 20 (임시 5) — 정상');
  });

  it('수치가 숨겨지면 부상 단계만 노출한다', () => {
    render(<HpBar hp={null} maxHp={null} tier="critical" />);
    expect(screen.getByText('위급')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAccessibleName('HP 상태: 위급');
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('전투 불능 상태를 표시한다', () => {
    render(<HpBar hp={0} maxHp={40} />);
    expect(screen.getByText('전투 불능')).toBeInTheDocument();
  });
});
