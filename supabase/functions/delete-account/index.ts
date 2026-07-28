/**
 * 계정 삭제 (Supabase Edge Function)
 *
 * auth.users에서 사용자를 지우려면 service_role 권한이 필요하다.
 * service_role 키는 서버에만 존재해야 하므로 이 작업은 Edge Function에서만 수행한다.
 *
 * 동작
 * - JWT로 신원을 확인한 뒤, "자기 자신"만 삭제한다. 대상 사용자 id는 요청 본문에서 받지 않는다.
 * - 소유 중인 캠페인이 있으면 삭제를 거부한다. (먼저 소유권을 넘기거나 캠페인을 삭제해야 한다.)
 * - auth.users 삭제 시 profiles가 on delete cascade로 함께 정리된다(0001_schema.sql).
 *
 * 배포
 *   supabase functions deploy delete-account
 */
import { PublicError, corsHeaders, jsonResponse, logEvent } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: '지원하지 않는 요청입니다.' }, { origin, status: 405 });
  }

  try {
    const auth = await requireUser(req);
    const admin = serviceClient();

    const { count, error: countError } = await admin
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', auth.userId);

    if (countError) {
      throw new PublicError('계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
    }
    if ((count ?? 0) > 0) {
      throw new PublicError(
        '소유 중인 캠페인이 있어 계정을 삭제할 수 없습니다. 캠페인을 먼저 삭제하거나 다른 사용자에게 넘겨 주세요.',
        409,
      );
    }

    const { error } = await admin.auth.admin.deleteUser(auth.userId);
    if (error) {
      logEvent('account.delete_failed');
      throw new PublicError('계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
    }

    logEvent('account.deleted', { user: auth.userId });
    return jsonResponse({ ok: true }, { origin });
  } catch (error) {
    if (error instanceof PublicError) {
      return jsonResponse({ error: error.message }, { origin, status: error.status });
    }
    logEvent('account.unhandled_error');
    return jsonResponse(
      { error: '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { origin, status: 500 },
    );
  }
});
