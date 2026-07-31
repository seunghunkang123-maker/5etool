import { expect, test } from '@playwright/test';

/**
 * 자료 보관함의 상태 도감 진입점과 세션 삭제 E2E.
 */

const DM = { name: '보관함DM', email: `lib-${Date.now()}@example.test`, password: 'test-password-1' };

test.describe('자료 보관함과 세션 관리', () => {
  test.describe.configure({ mode: 'serial' });

  test('보관함에서 상태를 추가하고, 세션을 지웠다가 되살린다', async ({ page }) => {
    page.on('pageerror', (e) => console.log('페이지 오류:', e.message));

    await page.goto('/signup');
    await page.getByLabel('표시 이름').fill(DM.name);
    await page.getByLabel('이메일').fill(DM.email);
    await page.getByLabel('비밀번호', { exact: true }).fill(DM.password);
    await page.getByLabel('비밀번호 확인').fill(DM.password);
    await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();

    await page.getByRole('button', { name: '새 캠페인', exact: true }).click();
    await page.getByLabel('캠페인 이름').fill('관리 캠페인');
    await page.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '관리 캠페인' })).toBeVisible();
    const campaignUrl = page.url();

    // ── 자료 보관함에서 상태 추가 ─────────────────────────────
    await page.goto(`${campaignUrl}/library`);
    await page.getByRole('button', { name: '상태 도감', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: '상태 효과 도감' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '상태 추가', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '상태 효과 추가' });
    await editor.getByLabel('이름').fill('파열');
    await editor.getByLabel('설명').fill('공격받을 때마다 스택만큼 추가 피해.\n스택은 전투가 끝나면 사라진다.');
    await editor.getByLabel('누적되는 상태 (스택)').check();
    await editor.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editor).toBeHidden();

    await dialog.getByLabel('상태 효과 검색').fill('파열');
    await expect(dialog.getByText('캠페인 전용', { exact: true })).toBeVisible();
    await expect(dialog.getByText('스택은 전투가 끝나면 사라진다.')).toBeVisible();
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();

    // 새로고침해도 남아 있다.
    await page.reload();
    await page.getByRole('button', { name: '상태 도감', exact: true }).click();
    await dialog.getByLabel('상태 효과 검색').fill('파열');
    await expect(dialog.getByText('캠페인 전용', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();

    // ── 세션 삭제 ─────────────────────────────────────────────
    await page.goto(campaignUrl);
    await page.getByRole('button', { name: '새 세션', exact: true }).click();
    await page.getByLabel('세션 제목').fill('지울 세션');
    await page.getByRole('button', { name: '예정 세션으로 저장', exact: true }).click();
    await expect(page.getByText('지울 세션')).toBeVisible();

    await page.getByRole('button', { name: '지울 세션 삭제' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText(/휴지통에서 복구할 수 있습니다/)).toBeVisible();
    await confirm.getByRole('button', { name: '삭제', exact: true }).click();

    await expect(page.getByText('세션을 삭제했습니다.')).toBeVisible();
    await expect(page.getByText('지울 세션')).toHaveCount(0);

    // ── 휴지통에서 복구 ───────────────────────────────────────
    await page.goto(`${campaignUrl}/settings`);
    await expect(page.getByText('지울 세션')).toBeVisible();
    await page.getByRole('button', { name: '복구', exact: true }).first().click();

    await page.goto(campaignUrl);
    await expect(page.getByText('지울 세션')).toBeVisible();
  });
});
