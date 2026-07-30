import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Settings, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useUserRealtime } from '@/hooks/useRealtime';
import { cn } from '@/lib/cn';
import { isDemoMode } from '@/data';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { CampaignAccent } from '@/features/campaigns/CampaignAccent';

/** 로그인 후 공통 레이아웃 (상단바 + 콘텐츠) */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile, user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  useUserRealtime(user?.id);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-surface)]">
      <CampaignAccent />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-[var(--color-accent)] focus:px-3 focus:py-2 focus:text-[var(--color-accent-fg)]"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-5">
          <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--color-fg)]">
            <Logo className="h-5 w-5 text-[var(--color-accent)]" />
            <span>캠페인 도우미</span>
          </Link>

          {isDemoMode ? (
            <span
              className="hidden rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-warning)] sm:inline"
              title="Supabase가 설정되지 않아 브라우저 로컬 저장소로 동작합니다."
            >
              데모 모드
            </span>
          ) : null}

          <nav aria-label="주요 메뉴" className="ml-auto flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  'hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm sm:flex',
                  isActive ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
                )
              }
            >
              <LayoutDashboard aria-hidden className="h-4 w-4" />
              대시보드
            </NavLink>

            <NotificationBell />

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="계정 메뉴"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Avatar url={profile?.avatar_url} name={profile?.display_name} size="md" />
              </Button>

              {menuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="메뉴 닫기"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-xl"
                  >
                    <p className="px-3 py-2 text-sm">
                      <span className="block font-medium">{profile?.display_name}</span>
                      <span className="block truncate text-xs text-[var(--color-fg-muted)]">{user?.email}</span>
                    </p>
                    <hr className="my-1 border-[var(--color-border)]" />
                    <MenuItem
                      icon={<Settings aria-hidden className="h-4 w-4" />}
                      label="설정"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/settings');
                      }}
                    />
                    {profile?.is_admin ? (
                      <MenuItem
                        icon={<Shield aria-hidden className="h-4 w-4" />}
                        label="운영자 화면"
                        onClick={() => {
                          setMenuOpen(false);
                          navigate('/admin');
                        }}
                      />
                    ) : null}
                    <MenuItem
                      icon={<LogOut aria-hidden className="h-4 w-4" />}
                      label="로그아웃"
                      onClick={async () => {
                        setMenuOpen(false);
                        await signOut();
                        navigate('/login');
                      }}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-5">
        {children}
      </main>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
    >
      {icon}
      {label}
    </button>
  );
}
