import { describe, expect, it } from 'vitest';
import { isMissingColumn, toAppError } from './client';

/**
 * 서버 오류를 사용자가 조치할 수 있는 메시지로 바꾸는지 확인한다.
 * 특히 "마이그레이션 미적용"은 입력 문제로 오해되면 영원히 해결되지 않는다.
 */
describe('toAppError', () => {
  it('서버 함수가 없으면 마이그레이션 적용을 안내한다', () => {
    for (const code of ['PGRST202', '42883']) {
      const error = toAppError({ message: 'function does not exist', code }, '실패했습니다.');
      expect(error.code).toBe('server');
      expect(error.message).toMatch(/마이그레이션/);
    }
  });

  it('SQL 함수가 올린 한국어 메시지를 그대로 보여 준다', () => {
    const error = toAppError({ message: '세션을 삭제할 권한이 없습니다.', code: 'P0001' }, '실패했습니다.');
    expect(error.message).toBe('세션을 삭제할 권한이 없습니다.');
  });

  it('P0002는 not_found로 분류한다', () => {
    const error = toAppError({ message: '세션을 찾을 수 없습니다.', code: 'P0002' }, '실패했습니다.');
    expect(error.code).toBe('not_found');
    expect(error.message).toBe('세션을 찾을 수 없습니다.');
  });

  it('권한 오류는 권한 문구로 바꾼다', () => {
    expect(toAppError({ message: 'permission denied', code: '42501' }, 'x').code).toBe('forbidden');
  });

  it('알 수 없는 오류는 기본 문구를 쓴다', () => {
    const error = toAppError({ message: 'boom', code: 'XX000' }, '세션을 삭제하지 못했습니다.');
    expect(error.message).toBe('세션을 삭제하지 못했습니다.');
    expect(error.code).toBe('unknown');
  });

  it('열이나 표가 없어도 마이그레이션 적용을 안내한다', () => {
    for (const code of ['42703', '42P01', 'PGRST204']) {
      const error = toAppError({ message: 'column does not exist', code }, '실패했습니다.');
      expect(error.code).toBe('server');
      expect(error.message).toMatch(/마이그레이션/);
    }
  });

  it('HP 제약 위반은 무엇이 문제인지 알려 준다', () => {
    const error = toAppError(
      { message: 'new row violates check constraint "combatant_hp_within_max"', code: '23514' },
      '참가자를 추가하지 못했습니다.',
    );
    expect(error.code).toBe('validation');
    expect(error.message).toMatch(/현재 HP가 최대 HP보다 클 수 없습니다/);
  });

  it('그 밖의 체크 제약은 일반 안내로 바꾼다', () => {
    const error = toAppError({ message: 'violates check constraint "x"', code: '23514' }, 'x');
    expect(error.code).toBe('validation');
    expect(error.message).toMatch(/규칙에 맞지 않습니다/);
  });

  it('필수 값 누락은 채워 달라고 안내한다', () => {
    expect(toAppError({ message: 'null value', code: '23502' }, 'x').message).toMatch(/필수 값/);
  });

  it('오류가 없으면 기본 문구', () => {
    expect(toAppError(null, '기본').message).toBe('기본');
  });
});

describe('isMissingColumn', () => {
  it('스키마가 덜 적용된 오류만 참으로 본다', () => {
    expect(isMissingColumn({ message: '', code: '42703' })).toBe(true);
    expect(isMissingColumn({ message: '', code: 'PGRST204' })).toBe(true);
    expect(isMissingColumn({ message: '', code: '42501' })).toBe(false);
    expect(isMissingColumn(null)).toBe(false);
  });
});
