import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastViewport, toast } from './components/ui/Toast';
import { ConfirmDialogHost } from './components/ui/ConfirmDialog';
import { ShortcutHelpHost } from './components/ui/ShortcutHelp';
import { initAuth, useAuthStore } from './stores/auth';
import { usePreferences } from './stores/preferences';
import { AppError } from './data/repository';
import { toUserMessage } from './lib/errors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // 권한/인증 오류는 재시도하지 않는다.
        if (error instanceof AppError && ['forbidden', 'unauthorized', 'not_found', 'validation'].includes(error.code)) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (error) => {
        toast.error(toUserMessage(error));
      },
    },
  },
});

export function App() {
  const user = useAuthStore((s) => s.user);
  const loadPreferences = usePreferences((s) => s.load);

  useEffect(() => initAuth(), []);

  useEffect(() => {
    void loadPreferences();
  }, [user?.id, loadPreferences]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <ConfirmDialogHost />
      <ShortcutHelpHost />
    </QueryClientProvider>
  );
}
