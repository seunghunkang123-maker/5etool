import { expect, test } from '@playwright/test';

/**
 * 특성·장비 칸의 서식 E2E.
 *
 * 굵게/기울임이 저장되고, 다시 열었을 때 유지되며, 플레이어 화면까지 전달되는지 확인한다.
 */

const DM = { name: '서식DM', email: `rt-dm-${Date.now()}@example.test`, password: 'test-password-1' };
const PLAYER = { name: '서식플레이어', email: `rt-pc-${Date.now()}@example.test`, password: 'test-password-2' };

test.describe('특성·장비 서식', () => {
  test.describe.configure({ mode: 'serial' });

  test('몬스터 특성에 굵게/기울임을 넣으면 플레이어에게도 서식이 보인다', async ({ browser }) => {
    const context = await browser.newContext();
    const dmPage = await context.newPage();
    const playerPage = await context.newPage();
    dmPage.on('pageerror', (e) => console.log('[DM] 오류:', e.message));

    // ── 준비 ──────────────────────────────────────────────────
    await dmPage.goto('/signup');
    await dmPage.getByLabel('표시 이름').fill(DM.name);
    await dmPage.getByLabel('이메일').fill(DM.email);
    await dmPage.getByLabel('비밀번호', { exact: true }).fill(DM.password);
    await dmPage.getByLabel('비밀번호 확인').fill(DM.password);
    await dmPage.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await expect(dmPage.getByRole('heading', { name: '대시보드' })).toBeVisible();

    await dmPage.getByRole('button', { name: '새 캠페인', exact: true }).click();
    await dmPage.getByLabel('캠페인 이름').fill('서식 캠페인');
    await dmPage.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(dmPage.getByRole('heading', { name: '서식 캠페인' })).toBeVisible();
    const campaignUrl = dmPage.url();
    const joinCode = (await dmPage.getByTestId('join-code').textContent())?.trim() ?? '';

    // ── 몬스터 카드에 특성 추가 ───────────────────────────────
    await dmPage.goto(`${campaignUrl}/library`);
    await dmPage.getByRole('button', { name: '새 카드', exact: true }).click();
    await dmPage.getByLabel('카드 이름').fill('서식 드레이크');
    await dmPage.getByRole('button', { name: '만들기', exact: true }).click();

    const editorDialog = dmPage.getByRole('dialog', { name: '카드 편집' });
    await expect(editorDialog).toBeVisible();
    await editorDialog.getByRole('tab', { name: '행동' }).click();
    await editorDialog.getByRole('button', { name: '특성', exact: true }).click();

    await editorDialog.getByLabel('이름').last().fill('화염 숨결');

    // 서식 편집기에 입력하고 굵게 적용
    const richField = editorDialog.locator('[contenteditable="true"]').last();
    await richField.click();
    await richField.pressSequentially('매우 뜨겁다');
    await richField.press('Control+a');
    await editorDialog.getByRole('button', { name: '굵게' }).last().click();

    await editorDialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(editorDialog.getByRole('status')).toContainText('저장 완료');

    // 특성이 있는 카드를 연달아 저장해도 실패하지 않는다.
    // (행동 행을 id 없이 보내야 한다. 예전에는 빈 문자열 id 때문에 두 번째 저장부터
    //  "저장 실패" → "다른 사용자가 먼저 내용을 수정했습니다"로 이어졌다.)
    for (const name of ['화염 숨결 2', '화염 숨결 3', '화염 숨결']) {
      await editorDialog.getByLabel('이름').last().fill(name);
      await editorDialog.getByRole('button', { name: '저장', exact: true }).click();
      await expect(editorDialog.getByRole('status')).toContainText('저장 완료');
      await expect(editorDialog.getByRole('status')).not.toContainText('실패');
    }
    await expect(dmPage.getByText('다른 사용자가 먼저')).toHaveCount(0);

    await dmPage.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(editorDialog).toBeHidden();

    // ── 새로고침 후에도 서식이 남아 있다 ─────────────────────
    await dmPage.reload();
    await dmPage.getByText('서식 드레이크').first().click();
    await expect(editorDialog).toBeVisible();
    await editorDialog.getByRole('tab', { name: '행동' }).click();
    await expect(editorDialog.locator('strong', { hasText: '매우 뜨겁다' })).toBeVisible();
    await dmPage.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(editorDialog).toBeHidden();

    // ── 세션에서 공개 ─────────────────────────────────────────
    await dmPage.goto(campaignUrl);
    await dmPage.getByRole('button', { name: '새 세션', exact: true }).click();
    await dmPage.getByLabel('세션 제목').fill('서식 세션');
    await dmPage.getByRole('button', { name: '바로 시작', exact: true }).click();
    await expect(dmPage.getByText('서식 세션')).toBeVisible();
    const sessionUrl = dmPage.url();

    // 공개 버튼은 세션 화면의 빠른 자료 패널에 있다.
    await dmPage.getByTestId('reveal-서식 드레이크').click();
    const revealDialog = dmPage.getByRole('dialog', { name: /공개 설정/ });
    await revealDialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(revealDialog).toBeHidden();

    // ── 플레이어 화면에서 서식 확인 ───────────────────────────
    await playerPage.goto('/signup');
    await playerPage.getByLabel('표시 이름').fill(PLAYER.name);
    await playerPage.getByLabel('이메일').fill(PLAYER.email);
    await playerPage.getByLabel('비밀번호', { exact: true }).fill(PLAYER.password);
    await playerPage.getByLabel('비밀번호 확인').fill(PLAYER.password);
    await playerPage.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await playerPage.getByRole('textbox', { name: '참여 코드' }).fill(joinCode);
    await playerPage.getByRole('button', { name: '참여하기', exact: true }).click();
    await expect(playerPage.getByRole('heading', { name: '서식 캠페인' })).toBeVisible();

    await playerPage.goto(sessionUrl);
    await playerPage.getByTestId('revealed-cards').getByText('서식 드레이크').click();

    const detail = playerPage.getByRole('dialog', { name: '서식 드레이크' });
    await expect(detail).toBeVisible();
    // 태그가 글자로 보이지 않고 실제 서식으로 적용돼야 한다.
    await expect(detail.locator('strong', { hasText: '매우 뜨겁다' })).toBeVisible();
    await expect(detail.getByText('<strong>')).toHaveCount(0);

    await context.close();
  });
});
