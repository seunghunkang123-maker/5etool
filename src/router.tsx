import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router-dom';
import { AppShell } from './features/layout/AppShell';
import { useAuthStore } from './stores/auth';
import { LoadingBlock } from './components/ui/feedback';
import { Button } from './components/ui/Button';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { DashboardPage } from './features/dashboard/DashboardPage';

/** 초기 화면에 필요 없는 화면은 지연 로딩한다. */
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const CampaignCreatePage = lazy(() => import('./features/campaigns/CampaignCreatePage').then((m) => ({ default: m.CampaignCreatePage })));
const CampaignPage = lazy(() => import('./features/campaigns/CampaignPage').then((m) => ({ default: m.CampaignPage })));
const MembersPage = lazy(() => import('./features/campaigns/MembersPage').then((m) => ({ default: m.MembersPage })));
const CampaignSettingsPage = lazy(() => import('./features/campaigns/CampaignSettingsPage').then((m) => ({ default: m.CampaignSettingsPage })));
const LibraryPage = lazy(() => import('./features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const CharactersPage = lazy(() => import('./features/characters/CharactersPage').then((m) => ({ default: m.CharactersPage })));
const SessionPage = lazy(() => import('./features/session/SessionPage').then((m) => ({ default: m.SessionPage })));
const SessionRecapPage = lazy(() => import('./features/session/SessionRecapPage').then((m) => ({ default: m.SessionRecapPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import('./features/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

function Loadable({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <LoadingBlock label="세션을 확인하는 중입니다" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RouteError() {
  const error = useRouteError();
  const message =
    error instanceof Error ? '화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : '알 수 없는 오류가 발생했습니다.';
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-lg font-semibold">문제가 발생했습니다</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">{message}</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          새로고침
        </Button>
        <Button variant="primary" onClick={() => (window.location.href = '/')}>
          대시보드로
        </Button>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: '/signup', element: <SignupPage />, errorElement: <RouteError /> },
  {
    path: '/reset-password',
    element: (
      <Loadable>
        <ResetPasswordPage />
      </Loadable>
    ),
    errorElement: <RouteError />,
  },
  { path: '/auth/callback', element: <Navigate to="/" replace /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell>
          <Outlet />
        </AppShell>
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'settings', element: <Loadable><SettingsPage /></Loadable> },
      { path: 'admin', element: <Loadable><AdminPage /></Loadable> },
      { path: 'campaigns/new', element: <Loadable><CampaignCreatePage /></Loadable> },
      { path: 'campaigns/:campaignId', element: <Loadable><CampaignPage /></Loadable> },
      { path: 'campaigns/:campaignId/library', element: <Loadable><LibraryPage /></Loadable> },
      { path: 'campaigns/:campaignId/characters', element: <Loadable><CharactersPage /></Loadable> },
      { path: 'campaigns/:campaignId/members', element: <Loadable><MembersPage /></Loadable> },
      { path: 'campaigns/:campaignId/settings', element: <Loadable><CampaignSettingsPage /></Loadable> },
      { path: 'campaigns/:campaignId/sessions/:sessionId/recap', element: <Loadable><SessionRecapPage /></Loadable> },
    ],
  },
  {
    // 세션 운영 화면은 전용 레이아웃을 쓰므로 AppShell 밖에 둔다.
    path: '/campaigns/:campaignId/sessions/:sessionId',
    element: (
      <RequireAuth>
        <Loadable>
          <SessionPage />
        </Loadable>
      </RequireAuth>
    ),
    errorElement: <RouteError />,
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
