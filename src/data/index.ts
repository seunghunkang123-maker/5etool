import type { Repository } from './repository';
import { isSupabaseConfigured } from './supabase/client';
import { createLocalRepository } from './local/repo';
import { createSupabaseRepository } from './supabase/repo';

/**
 * 환경 변수에 따라 저장소 어댑터를 선택한다.
 * Supabase 설정이 없으면 데모 모드(브라우저 로컬 저장소)로 동작한다.
 */

let instance: Repository | null = null;

export function repo(): Repository {
  if (!instance) {
    instance = isSupabaseConfigured ? createSupabaseRepository() : createLocalRepository();
  }
  return instance;
}

export const isDemoMode = !isSupabaseConfigured;

export * from './repository';
export * from './types';
