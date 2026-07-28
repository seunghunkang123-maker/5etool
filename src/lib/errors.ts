import { AppError } from '@/data/repository';

/**
 * 모든 오류를 사용자가 이해할 수 있는 한국어 메시지로 변환한다.
 * 기술적 원문은 콘솔에만 남기고 화면에는 해결 방법을 안내한다.
 */

const CODE_MESSAGES: Record<AppError['code'], string> = {
  unauthorized: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  forbidden: '이 작업을 수행할 권한이 없습니다.',
  not_found: '요청한 정보를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었을 수 있습니다.',
  conflict: '다른 사용자가 먼저 내용을 수정했습니다. 변경 사항을 비교해 주세요.',
  validation: '입력한 내용을 다시 확인해 주세요.',
  network: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
  rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  unknown: '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
};

export function toUserMessage(error: unknown, fallback = '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (error instanceof AppError) {
    // AppError는 이미 상황에 맞는 한국어 메시지를 담고 있다.
    return error.message || CODE_MESSAGES[error.code];
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return CODE_MESSAGES.network;
  }
  if (error instanceof Error && error.name === 'DiceParseError') {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    // 기술적 원문을 그대로 노출하지 않는다.
    console.error('[arcanum] 처리되지 않은 오류', error);
    return fallback;
  }
  return fallback;
}

export function errorCode(error: unknown): AppError['code'] {
  return error instanceof AppError ? error.code : 'unknown';
}

export function isConflict(error: unknown): boolean {
  return errorCode(error) === 'conflict';
}

export function isAuthError(error: unknown): boolean {
  return errorCode(error) === 'unauthorized';
}
