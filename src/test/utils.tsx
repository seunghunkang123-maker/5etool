import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { repo } from '@/data';
import { localStore } from '@/data/local/store';

/** 컴포넌트 테스트용 공통 래퍼 (라우터 + 쿼리 클라이언트) */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}

/** 데모 저장소를 비우고 테스트용 던전 마스터 계정을 만든다. */
export async function seedDemoUser(email = 'dm@test.local', password = 'test-password') {
  localStore.reset();
  return repo().auth.signUp(email, password, '테스트 DM');
}

export async function seedCampaign(name = '테스트 캠페인') {
  return repo().campaigns.create({ name });
}
