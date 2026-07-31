import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../repository';

/**
 * Supabase 클라이언트.
 * anon 키만 사용한다. service_role 키는 절대 클라이언트 번들에 포함하지 않는다.
 */

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const forceDemo = import.meta.env.VITE_FORCE_DEMO === 'true';

export const isSupabaseConfigured = Boolean(url && anonKey) && !forceDemo;

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new AppError('Supabase가 설정되지 않았습니다.', 'unknown');
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

interface PostgrestErrorLike {
  message: string;
  code?: string;
  details?: string;
}

/** Postgrest 오류를 사용자용 한국어 메시지로 변환한다. */
export function toAppError(error: PostgrestErrorLike | null | undefined, fallback: string): AppError {
  if (!error) return new AppError(fallback, 'unknown');
  const code = error.code ?? '';
  if (code === 'PGRST301' || code === '42501') {
    return new AppError('이 작업을 수행할 권한이 없습니다.', 'forbidden', error);
  }
  if (code === 'PGRST116') {
    return new AppError('요청한 데이터를 찾을 수 없습니다.', 'not_found', error);
  }
  if (code === '23505') {
    return new AppError('이미 존재하는 값입니다.', 'conflict', error);
  }
  if (code === '23503') {
    return new AppError('연결된 데이터가 있어 처리할 수 없습니다.', 'conflict', error);
  }
  // 서버 함수가 아직 없다. 마이그레이션을 적용하지 않은 경우다.
  // 사용자가 입력을 고쳐서 해결할 수 없는 문제이므로 원인을 그대로 알려 준다.
  if (code === 'PGRST202' || code === '42883') {
    return new AppError(
      '서버 기능이 준비되지 않았습니다. 데이터베이스 마이그레이션이 모두 적용되었는지 확인해 주세요.',
      'server',
      error,
    );
  }
  // P0001/P0002는 이 프로젝트의 SQL 함수가 직접 올린 오류다.
  // 함수가 한국어 메시지를 담아 던지므로 그대로 보여 준다.
  if (code === 'P0001' || code === 'P0002') {
    return new AppError(error.message || fallback, code === 'P0002' ? 'not_found' : 'validation', error);
  }
  if (code.startsWith('P0') || code === '23514') {
    return new AppError('입력값이 규칙에 맞지 않습니다.', 'validation', error);
  }
  return new AppError(fallback, 'unknown', error);
}

/**
 * { data, error } 결과를 풀어 오류를 AppError로 바꾼다.
 * 스키마 타입을 생성하지 않으므로 반환값은 unknown이며, 호출부에서 도메인 타입으로 단언한다.
 */
export function unwrap(result: { data: unknown; error: PostgrestErrorLike | null }, fallback: string): unknown {
  if (result.error) throw toAppError(result.error, fallback);
  if (result.data === null || result.data === undefined) throw new AppError(fallback, 'not_found');
  return result.data;
}

export function unwrapVoid(result: { error: PostgrestErrorLike | null }, fallback: string): void {
  if (result.error) throw toAppError(result.error, fallback);
}
