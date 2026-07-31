import { expect, test, type Page } from '@playwright/test';

/**
 * 상태 효과 도감 E2E.
 *
 * DM이 캠페인 전용 상태를 만들고 스택을 쌓으면, 플레이어가 그 설명과 스택을
 * 자기 화면에서 확인할 수 있어야 한다. 두 탭으로 실제 흐름을 재현한다.
 */

const CROSS_TAB_TIMEOUT = 30_000;

const DM = { name: '도감DM', email: `cref-dm-${Date.now()}@example.test`, password: 'test-password-1' };
const PLAYER = { name: '도감플레이어', email: `cref-pc-${Date.now()}@example.test`, password: 'test-password-2' };

async function signUp(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto('/signup');
  await page.getByLabel('표시 이름').fill(user.name);
  await page.getByLabel('이메일').fill(user.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(user.password);
  await page.getByLabel('비밀번호 확인').fill(user.password);
  await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
}

test.describe('상태 효과 도감', () => {
  test.describe.configure({ mode: 'serial' });

  test('DM이 만든 캠페인 전용 상태를 플레이어가 확인한다', async ({ browser }) => {
    const context = await browser.newContext();
    const dmPage = await context.newPage();
    const playerPage = await context.newPage();
    dmPage.on('pageerror', (e) => console.log('[DM] 오류:', e.message));
    playerPage.on('pageerror', (e) => console.log('[플레이어] 오류:', e.message));

    // ── 준비: 캠페인, 세션, 전투 ──────────────────────────────
    await signUp(dmPage, DM);
    await dmPage.getByRole('button', { name: '새 캠페인', exact: true }).click();
    await dmPage.getByLabel('캠페인 이름').fill('도감 캠페인');
    await dmPage.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(dmPage.getByRole('heading', { name: '도감 캠페인' })).toBeVisible();

    const joinCode = (await dmPage.getByTestId('join-code').textContent())?.trim() ?? '';
    expect(joinCode).toHaveLength(6);

    await signUp(playerPage, PLAYER);
    await playerPage.getByRole('textbox', { name: '참여 코드' }).fill(joinCode);
    await playerPage.getByRole('button', { name: '참여하기', exact: true }).click();
    await expect(playerPage.getByRole('heading', { name: '도감 캠페인' })).toBeVisible();

    await dmPage.bringToFront();
    await dmPage.getByRole('button', { name: '새 세션', exact: true }).click();
    await dmPage.getByLabel('세션 제목').fill('도감 세션');
    await dmPage.getByRole('button', { name: '바로 시작', exact: true }).click();
    await expect(dmPage.getByText('도감 세션')).toBeVisible();
    const sessionUrl = dmPage.url();
    expect(sessionUrl).toContain('/sessions/');

    // ── DM: 캠페인 전용 상태 추가 ─────────────────────────────
    await dmPage.getByRole('button', { name: '상태 효과 도감 열기' }).click();
    const dialog = dmPage.getByRole('dialog', { name: '상태 효과 도감' });
    await expect(dialog).toBeVisible();

    // 시스템 기본 상태가 이미 들어 있다.
    await dialog.getByLabel('상태 효과 검색').fill('넘어짐');
    await expect(dialog.getByText('포복', { exact: false }).first()).toBeVisible();

    await dialog.getByRole('button', { name: '상태 추가', exact: true }).click();
    const editor = dmPage.getByRole('dialog', { name: '상태 효과 추가' });
    await editor.getByLabel('이름').fill('출혈');
    await editor.getByLabel('설명').fill('턴 시작 시 스택만큼 피해를 받는다.\n턴이 끝나면 스택이 1 줄어든다.');
    await editor.getByLabel('누적되는 상태 (스택)').check();
    await editor.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editor).toBeHidden();

    // 추가한 상태가 도감에 보인다.
    await dialog.getByLabel('상태 효과 검색').fill('출혈');
    await expect(dialog.getByText('캠페인 전용', { exact: true })).toBeVisible();
    await expect(dialog.getByText('턴이 끝나면 스택이 1 줄어든다.')).toBeVisible();
    await dmPage.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(dialog).toBeHidden();

    // ── DM: 전투에 상태 적용 + 스택 쌓기 ──────────────────────
    await dmPage.getByRole('button', { name: '전투 만들기', exact: true }).click();
    await dmPage.getByRole('button', { name: '참가자', exact: true }).click();
    const addDialog = dmPage.getByRole('dialog', { name: '전투 참가자 추가' });
    await addDialog.getByRole('tab', { name: '즉석 참가자' }).click();
    await addDialog.getByLabel('이름').fill('보스');
    await addDialog.getByRole('button', { name: '추가', exact: true }).click();
    await expect(addDialog).toBeHidden();

    await dmPage.getByRole('button', { name: '보스 상태 추가' }).click();
    const condDialog = dmPage.getByRole('dialog', { name: /상태 효과 적용/ });
    await condDialog.getByLabel('상태 효과').selectOption({ label: '★ 출혈' });
    await condDialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(condDialog).toBeHidden();

    // 스택을 두 번 올린다 → 3
    await dmPage.getByRole('button', { name: '출혈 스택 1 늘리기' }).click();
    await dmPage.getByRole('button', { name: '출혈 스택 1 늘리기' }).click();
    await expect(dmPage.getByRole('button', { name: /출혈.*3중첩/ })).toBeVisible();

    // 플레이어 화면의 이니셔티브는 전투가 시작돼야 나온다.
    await dmPage.getByRole('spinbutton', { name: '보스 이니셔티브' }).fill('15');
    await dmPage.getByRole('button', { name: '전투 시작', exact: true }).click();
    await expect(dmPage.getByTestId('round-display')).toContainText('라운드 1');

    // ── 플레이어: 배지를 눌러 설명을 확인한다 ─────────────────
    await playerPage.bringToFront();
    await playerPage.goto(sessionUrl);

    const playerBadge = playerPage.getByRole('button', { name: /출혈.*3중첩/ });
    await expect(playerBadge).toBeVisible({ timeout: CROSS_TAB_TIMEOUT });
    await playerBadge.click();

    const playerDialog = playerPage.getByRole('dialog', { name: '상태 효과 도감' });
    await expect(playerDialog).toBeVisible();
    await expect(playerDialog.getByText('턴 시작 시 스택만큼 피해를 받는다.')).toBeVisible();

    // 플레이어에게는 편집 버튼이 없다.
    await expect(playerDialog.getByRole('button', { name: '상태 추가', exact: true })).toHaveCount(0);

    await context.close();
  });
});
