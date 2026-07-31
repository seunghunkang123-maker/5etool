import { expect, test, type Page } from '@playwright/test';

/**
 * 전체 사용자 흐름 E2E (요구사항 44의 20단계).
 *
 * 데모 모드(로컬 어댑터)로 실행한다.
 * - 데이터: localStorage (탭 간 공유)
 * - 로그인 세션: sessionStorage (탭마다 분리)
 * → 같은 브라우저 컨텍스트의 두 탭으로 던전 마스터와 플레이어를 동시에 재현하고
 *   BroadcastChannel 기반 실시간 동기화를 검증한다.
 */

/**
 * 탭 간 실시간 반영 대기 시간.
 * 데모 모드의 탭 간 동기화는 BroadcastChannel + storage 이벤트 + 1초 폴링으로 이루어진다.
 * 빌드 직후처럼 기기 부하가 높을 때는 전달이 늦어질 수 있어 넉넉히 잡는다.
 */
const CROSS_TAB_TIMEOUT = 30_000;

const DM = { name: '던전마스터', email: `dm-${Date.now()}@example.test`, password: 'test-password-1' };
const PLAYER = { name: '플레이어하나', email: `pc-${Date.now()}@example.test`, password: 'test-password-2' };

async function signUp(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto('/signup');
  await page.getByLabel('표시 이름').fill(user.name);
  await page.getByLabel('이메일').fill(user.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(user.password);
  await page.getByLabel('비밀번호 확인').fill(user.password);
  await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
}

test.describe('던전 마스터와 플레이어의 전체 세션 흐름', () => {
  test.describe.configure({ mode: 'serial' });

  test('회원가입부터 세션 종료까지', async ({ browser }) => {
    const context = await browser.newContext();
    const dmPage = await context.newPage();
    const playerPage = await context.newPage();

    // 실패 원인 파악을 돕기 위해 페이지 오류를 그대로 노출한다.
    dmPage.on('pageerror', (error) => console.log('[DM] 페이지 오류:', error.message));
    playerPage.on('pageerror', (error) => console.log('[플레이어] 페이지 오류:', error.message));
    dmPage.on('console', (msg) => msg.type() === 'error' && console.log('[DM] 콘솔:', msg.text().slice(0, 300)));
    playerPage.on('console', (msg) => msg.type() === 'error' && console.log('[플레이어] 콘솔:', msg.text().slice(0, 300)));

    // ── 1. 던전 마스터 회원가입 및 로그인 ──────────────────────
    await signUp(dmPage, DM);

    // ── 2. 캠페인 생성 ────────────────────────────────────────
    await dmPage.getByRole('button', { name: '새 캠페인', exact: true }).click();
    await dmPage.getByLabel('캠페인 이름').fill('얼음 호수의 그림자');
    await dmPage.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(dmPage.getByRole('heading', { name: '얼음 호수의 그림자' })).toBeVisible();

    // ── 3. 참여 코드 생성 확인 ────────────────────────────────
    const joinCode = (await dmPage.getByTestId('join-code').textContent())?.trim() ?? '';
    expect(joinCode).toHaveLength(6);
    const campaignUrl = dmPage.url();

    // ── 5. 몬스터 카드 생성 ───────────────────────────────────
    await dmPage.getByRole('button', { name: '자료 보관함', exact: true }).click();
    await dmPage.getByRole('button', { name: '새 카드', exact: true }).click();
    await dmPage.getByLabel('카드 이름').fill('서리 고블린');
    await dmPage.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(dmPage.getByRole('dialog', { name: '카드 편집' })).toBeVisible();
    await dmPage.getByRole('tab', { name: '능력치' }).click();
    await dmPage.getByLabel('최대 HP').fill('20');
    await dmPage.getByLabel('현재 HP').fill('20');
    await dmPage.getByRole('button', { name: '저장', exact: true }).click();
    await dmPage.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(dmPage.getByRole('dialog', { name: '카드 편집' })).toBeHidden();

    // ── 6. 핸드아웃 카드 생성 ─────────────────────────────────
    await dmPage.getByRole('button', { name: '새 카드', exact: true }).click();
    await dmPage.getByLabel('카드 이름').fill('고대 지도');
    await dmPage.getByLabel('카드 유형').selectOption('handout');
    await dmPage.getByRole('button', { name: '만들기', exact: true }).click();
    await expect(dmPage.getByRole('dialog', { name: '카드 편집' })).toBeVisible();
    await dmPage.getByRole('button', { name: '닫기', exact: true }).last().click();

    // 카드가 기본적으로 비공개인지 확인
    await expect(dmPage.getByText('비공개').first()).toBeVisible();

    // ── 4. 플레이어 계정으로 캠페인 참여 ──────────────────────
    await signUp(playerPage, PLAYER);
    await playerPage.getByRole('textbox', { name: '참여 코드' }).fill(joinCode);
    await playerPage.getByRole('button', { name: '참여하기', exact: true }).click();
    await expect(playerPage.getByRole('heading', { name: '얼음 호수의 그림자' })).toBeVisible();

    // 플레이어 캐릭터 생성
    await playerPage.getByRole('button', { name: '캐릭터', exact: true }).click();
    await playerPage.getByRole('button', { name: '새 캐릭터', exact: true }).click();
    await expect(playerPage.getByRole('dialog')).toBeVisible();
    await playerPage.getByLabel('캐릭터 이름').fill('아린');
    await playerPage.getByLabel('최대 HP').fill('30');
    await playerPage.getByLabel('현재 HP').fill('30');
    await playerPage.getByRole('button', { name: '닫기', exact: true }).last().click();

    // 공개 전에는 플레이어에게 자료가 보이지 않는다
    await playerPage.goto(campaignUrl);
    await expect(playerPage.getByText('고대 지도')).toHaveCount(0);

    // ── 세션 생성 및 시작 ─────────────────────────────────────
    await dmPage.goto(campaignUrl);
    await dmPage.getByRole('button', { name: '새 세션', exact: true }).click();
    await dmPage.getByLabel('세션 제목').fill('첫 번째 밤');
    await dmPage.getByRole('button', { name: '바로 시작', exact: true }).click();
    await expect(dmPage.getByText('첫 번째 밤')).toBeVisible();
    const sessionUrl = dmPage.url();
    expect(sessionUrl).toContain('/sessions/');

    // ── 7. 핸드아웃 공개 ──────────────────────────────────────
    await dmPage.getByTestId('reveal-고대 지도').click();
    await expect(dmPage.getByRole('dialog', { name: /공개 설정/ })).toBeVisible();
    await dmPage.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dmPage.getByRole('dialog', { name: /공개 설정/ })).toBeHidden();

    // ── 8. 플레이어 화면에서 실시간 확인 ──────────────────────
    // 실제 플레이어처럼 해당 탭을 활성 상태로 둔다(백그라운드 탭은 브라우저가 작업을 지연시킨다).
    await playerPage.bringToFront();
    await playerPage.goto(sessionUrl);
    await expect(playerPage.getByTestId('revealed-cards').getByText('고대 지도')).toBeVisible({ timeout: CROSS_TAB_TIMEOUT });

    // ── 9~10. 전투 생성 및 참가자 추가 ────────────────────────
    await dmPage.bringToFront();
    await dmPage.getByRole('button', { name: '전투 만들기', exact: true }).click();
    await expect(dmPage.getByText('준비 중')).toBeVisible();

    await dmPage.getByRole('button', { name: '참가자', exact: true }).click();
    await expect(dmPage.getByRole('dialog', { name: '전투 참가자 추가' })).toBeVisible();
    await dmPage.getByRole('dialog', { name: '전투 참가자 추가' }).getByRole('button', { name: /서리 고블린/ }).click();
    await expect(dmPage.getByRole('dialog', { name: '전투 참가자 추가' })).toBeHidden();

    await dmPage.getByRole('button', { name: '참가자', exact: true }).click();
    await dmPage.getByRole('tab', { name: '플레이어 캐릭터' }).click();
    await dmPage.getByRole('dialog', { name: '전투 참가자 추가' }).getByRole('button', { name: /아린/ }).click();
    await expect(dmPage.getByRole('dialog', { name: '전투 참가자 추가' })).toBeHidden();

    // ── 11. 이니셔티브 입력 ───────────────────────────────────
    await dmPage.getByRole('spinbutton', { name: '서리 고블린 이니셔티브' }).fill('18');
    await dmPage.getByRole('spinbutton', { name: '아린 이니셔티브' }).fill('12');
    await dmPage.getByRole('button', { name: '전체 굴림', exact: true }).click();

    // ── 12. 전투 시작 ─────────────────────────────────────────
    await dmPage.getByRole('button', { name: '전투 시작', exact: true }).click();
    await expect(dmPage.getByTestId('round-display')).toContainText('라운드 1');

    // ── 13. 피해 적용 ─────────────────────────────────────────
    await dmPage.getByRole('spinbutton', { name: '서리 고블린 HP 조정값' }).fill('7');
    await dmPage.getByRole('button', { name: '피해', exact: true }).first().click();
    await expect(dmPage.getByTestId('combatant-서리 고블린')).toContainText('13');

    // ── 14. 플레이어 화면에 HP 상태 반영 ──────────────────────
    await playerPage.bringToFront();
    await expect(playerPage.getByTestId('initiative-서리 고블린')).toBeVisible({ timeout: CROSS_TAB_TIMEOUT });
    await expect(playerPage.getByTestId('player-round')).toContainText('라운드 1');

    // ── 15. 상태 효과 적용 ────────────────────────────────────
    await dmPage.bringToFront();
    // 버튼은 참가자마다 있으므로 이름으로 구분한다.
    await dmPage.getByRole('button', { name: '서리 고블린 상태 추가', exact: true }).click();
    await expect(dmPage.getByRole('dialog', { name: /상태 효과 적용/ })).toBeVisible();
    await dmPage.getByRole('combobox', { name: '상태 효과' }).selectOption('poisoned');
    await dmPage.getByRole('button', { name: '적용', exact: true }).click();
    await expect(dmPage.getByRole('button', { name: '중독 해제', exact: true })).toBeVisible();

    // ── 16~17. 다음 턴 이동과 라운드 증가 ─────────────────────
    await dmPage.getByTestId('next-turn').click();
    await expect(dmPage.getByTestId('combatant-아린')).toContainText('현재 차례');
    await dmPage.getByTestId('next-turn').click();
    await expect(dmPage.getByTestId('round-display')).toContainText('라운드 2');
    await playerPage.bringToFront();
    await expect(playerPage.getByTestId('player-round')).toContainText('라운드 2', { timeout: CROSS_TAB_TIMEOUT });

    // ── 18. 타이머 시작 ───────────────────────────────────────
    await dmPage.bringToFront();
    await dmPage.getByRole('button', { name: '타이머 추가', exact: true }).click();
    await dmPage.getByLabel('이름').fill('결정까지');
    await dmPage.getByLabel('분').fill('2');
    await dmPage.getByRole('button', { name: '만들기', exact: true }).click();
    await dmPage.getByRole('button', { name: '결정까지 시작', exact: true }).click();

    // ── 19. 플레이어 화면에서 타이머 확인 ─────────────────────
    await playerPage.bringToFront();
    await expect(playerPage.getByText('결정까지')).toBeVisible({ timeout: CROSS_TAB_TIMEOUT });

    // ── 20. 전투와 세션 종료 ──────────────────────────────────
    await dmPage.bringToFront();
    await dmPage.getByRole('button', { name: '전투 종료', exact: true }).click();
    await dmPage.getByRole('button', { name: '전투 종료', exact: true }).last().click();
    await expect(dmPage.getByRole('button', { name: '전투 만들기', exact: true })).toBeVisible();

    await dmPage.getByRole('button', { name: '세션 종료', exact: true }).click();
    await dmPage.getByRole('button', { name: '세션 종료', exact: true }).last().click();
    await expect(dmPage.getByRole('heading', { name: /세션 기록/ })).toBeVisible();

    // 세션 종료 후 로그가 남아 있는지 확인
    await expect(dmPage.getByText(/세션이 종료되었습니다/)).toBeVisible();

    await context.close();
  });
});
