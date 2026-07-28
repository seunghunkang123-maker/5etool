/**
 * Edge Function 공통 HTTP 도우미.
 *
 * - CORS 헤더를 한 곳에서 관리한다.
 * - 오류 응답 본문은 항상 사용자에게 그대로 보여줄 수 있는 한국어 메시지만 담는다.
 *   (내부 예외 메시지, 스택, 외부 API 응답 원문은 절대 클라이언트로 내보내지 않는다.)
 */

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  // ALLOWED_ORIGINS를 설정하지 않으면 모든 출처를 허용한다(개발 편의).
  // 운영 환경에서는 반드시 배포 도메인을 지정할 것.
  const allow =
    ALLOWED_ORIGINS.length === 0
      ? (origin ?? '*')
      : origin && ALLOWED_ORIGINS.includes(origin)
        ? origin
        : (ALLOWED_ORIGINS[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; origin: string | null },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...corsHeaders(init.origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 사용자에게 보여줄 한국어 메시지를 담은 오류. */
export class PublicError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PublicError';
    this.status = status;
  }
}

/**
 * 서버 로그에는 민감 정보(요청 본문, 토큰, API 키)를 남기지 않는다.
 * 식별 가능한 최소 정보만 기록한다.
 */
export function logEvent(event: string, fields: Record<string, string | number | boolean> = {}) {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  console.log(`[${event}] ${parts.join(' ')}`);
}
