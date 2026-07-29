import { describe, expect, it } from 'vitest';
import { AppError } from '../repository';
import { signUpError } from './repo';

/**
 * 회원가입 실패 메시지.
 * 서버 설정 문제를 "입력값을 확인하세요"로 안내하면 사용자가 고칠 수 없는 것을 계속 고치게 된다.
 * 원인별로 다음 행동이 드러나야 한다.
 */
describe('signUpError', () => {
  const cases: { raw: string; code: AppError['code']; expect: RegExp }[] = [
    { raw: 'User already registered', code: 'conflict', expect: /이미 가입된/ },
    { raw: 'Database error saving new user', code: 'server', expect: /마이그레이션/ },
    { raw: 'Password should be at least 6 characters', code: 'validation', expect: /비밀번호/ },
    { raw: 'Unable to validate email address: invalid format', code: 'validation', expect: /이메일/ },
    { raw: 'Error sending confirmation email', code: 'server', expect: /인증 메일/ },
    { raw: 'Signups not allowed for this instance', code: 'forbidden', expect: /가입이 중단/ },
  ];

  for (const item of cases) {
    it(`"${item.raw}" → ${item.code}`, () => {
      const error = signUpError({ message: item.raw });
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(item.code);
      expect(error.message).toMatch(item.expect);
    });
  }

  it('속도 제한은 상태 코드로도 판별한다', () => {
    expect(signUpError({ message: 'too many requests', status: 429 }).code).toBe('rate_limit');
  });

  it('알 수 없는 원인은 원문을 감추지 않는다', () => {
    const error = signUpError({ message: 'unexpected upstream failure' });
    expect(error.message).toContain('unexpected upstream failure');
  });

  it('원문이 없으면 안내 문구만 보여 준다', () => {
    expect(signUpError({}).message).toMatch(/잠시 후 다시 시도/);
  });
});
