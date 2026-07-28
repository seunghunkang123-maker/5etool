/**
 * 요청 인증/인가 도우미.
 *
 * 중요: 프론트엔드가 보낸 role이나 권한 값은 절대 신뢰하지 않는다.
 * 사용자 신원은 JWT에서, 캠페인 권한은 데이터베이스 함수(has_campaign_permission)에서 확인한다.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { PublicError } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export interface AuthedRequest {
  userId: string;
  /** 호출자의 JWT로 동작하는 클라이언트. RLS가 그대로 적용된다. */
  asUser: SupabaseClient;
}

/** service_role 클라이언트. RLS를 우회하므로 꼭 필요한 곳에서만 사용한다. */
export function serviceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new PublicError('서버 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.', 500);
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Authorization 헤더의 JWT를 검증하고 호출자 신원을 돌려준다. */
export async function requireUser(req: Request): Promise<AuthedRequest> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    throw new PublicError('로그인이 필요합니다. 다시 로그인해 주세요.', 401);
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new PublicError('서버 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.', 500);
  }

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) {
    throw new PublicError('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401);
  }
  return { userId: data.user.id, asUser };
}

/**
 * 캠페인 권한 확인. 데이터베이스의 SECURITY DEFINER 함수를 호출하므로
 * 클라이언트가 보낸 값이 아니라 실제 멤버십 행을 기준으로 판단한다.
 */
export async function requireCampaignPermission(
  auth: AuthedRequest,
  campaignId: string,
  permission: string,
): Promise<void> {
  const { data, error } = await auth.asUser.rpc('has_campaign_permission', {
    p_campaign_id: campaignId,
    p_permission: permission,
  });
  if (error) {
    throw new PublicError('권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
  if (data !== true) {
    throw new PublicError('이 작업을 수행할 권한이 없습니다.', 403);
  }
}
