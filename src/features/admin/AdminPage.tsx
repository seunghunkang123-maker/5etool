import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, Gauge, ShieldAlert, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useCampaigns } from '@/hooks/queries';
import { EmptyState } from '@/components/ui/feedback';
import { repo, isDemoMode } from '@/data';
import { formatBytes } from '@/lib/format';

/**
 * 최소 운영자 화면.
 * 일반 사용자는 접근할 수 없다(프론트 차단 + 서버 정책 `profiles.is_admin`).
 */
export function AdminPage() {
  const profile = useAuthStore((s) => s.profile);
  const { data: campaigns = [] } = useCampaigns();

  const { data: storageUsage = 0 } = useQuery({
    queryKey: ['admin-storage'],
    queryFn: async () => {
      let total = 0;
      for (const campaign of campaigns) {
        const files = await repo().files.list(campaign.id).catch(() => []);
        total += files.reduce((sum, file) => sum + file.size_bytes, 0);
      }
      return total;
    },
    enabled: campaigns.length > 0,
  });

  if (!profile) return null;
  if (!profile.is_admin) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert aria-hidden className="h-6 w-6" />
          운영자 화면
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          서비스 운영에 필요한 최소 정보만 표시합니다. 사용자 데이터의 내용은 조회하지 않습니다.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Users aria-hidden className="h-5 w-5" />} label="접근 가능한 캠페인" value={`${campaigns.length}개`} />
        <StatCard icon={<Database aria-hidden className="h-5 w-5" />} label="저장 공간 사용량" value={formatBytes(storageUsage)} />
        <StatCard icon={<Gauge aria-hidden className="h-5 w-5" />} label="AI 호출량" value={isDemoMode ? '데모 모드' : 'Edge Function 로그 참조'} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">신고된 콘텐츠</h2>
        <EmptyState title="처리할 신고가 없습니다" description="사용자가 콘텐츠를 신고하면 여기에 표시됩니다." />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">운영 안내</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-[var(--color-fg-muted)]">
          <li>계정 제한과 캠페인 접근 제한은 Supabase 대시보드에서 `profiles.is_suspended` 값을 변경해 적용합니다.</li>
          <li>데이터 삭제 요청은 `docs/BACKUP.md`의 절차를 따릅니다.</li>
          <li>비정상적인 API 사용과 오류 로그는 Supabase 로그 탐색기에서 확인합니다.</li>
          <li>AI 호출량은 `ai_usage` 테이블과 Edge Function 로그로 확인합니다.</li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2 text-[var(--color-fg-muted)]">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
