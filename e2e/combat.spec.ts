import { expect, test } from '@playwright/test';

/**
 * 전투 패널 E2E.
 *
 * session-flow.spec.ts가 다루지 않던 경로를 확인한다.
 *  - 즉석 참가자 탭
 *  - 한 번에 여러 마리 추가(이름 번호 붙이기)
 *  - 숫자 칸을 비웠을 때
 *  - 라운드 진행, HP 적용, 상태 스택, 참가자 제거
 */

const DM = { name: '전투DM', email: `combat-${Date.now()}@example.test`, password: 'test-password-1' };

test.describe('전투 진행', () => {
  test.describe.configure({ mode: 'serial' });

  test('즉석 참가자를 여럿 추가하고 전투를 끝까지 진행한다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // ── 준비 ──────────────────────────────────────────────────
    await page.goto('/signup');
    await page.getByLabel('표시 이름').fill(DM.name);
    await page.getByLabel('이메일').fill(DM.email);
    await page.getByLabel('비밀번호', { exact: true }).fill(DM.password);
    await page.getByLabel('비밀번호 확인').fill(DM.password);
    await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();

    await page.getByRole('button', { name: '새 캠페인', exact: true }).click();
    await page.getByLabel('캠페인 이름').fill('전투 캠페인');
    await page.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '전투 캠페인' })).toBeVisible();

    await page.getByRole('button', { name: '새 세션', exact: true }).click();
    await page.getByLabel('세션 제목').fill('전투 세션');
    await page.getByRole('button', { name: '바로 시작', exact: true }).click();
    await expect(page.getByText('전투 세션')).toBeVisible();

    // ── 전투 만들기 ───────────────────────────────────────────
    await page.getByRole('button', { name: '전투 만들기', exact: true }).click();
    await expect(page.getByRole('button', { name: '참가자', exact: true })).toBeVisible();

    const dialog = page.getByRole('dialog', { name: '전투 참가자 추가' });

    // ── 즉석 참가자 1명 ───────────────────────────────────────
    await page.getByRole('button', { name: '참가자', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: '즉석 참가자' }).click();
    await dialog.getByLabel('이름').fill('성난 군중');
    await dialog.getByLabel('HP').fill('24');
    await dialog.getByLabel('방어도').fill('11');
    await dialog.getByLabel('민첩').fill('14');
    await dialog.getByRole('button', { name: '추가', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByTestId('combatant-성난 군중')).toBeVisible();
    // 민첩 14 → 수정치 +2
    await expect(page.getByTestId('combatant-성난 군중')).toContainText('민첩 14 (+2)');

    // ── 같은 이름으로 3마리 한 번에 ───────────────────────────
    await page.getByRole('button', { name: '참가자', exact: true }).click();
    await dialog.getByRole('tab', { name: '즉석 참가자' }).click();
    await dialog.getByLabel('추가 수량').fill('3');
    await dialog.getByLabel('이름').fill('고블린');
    await dialog.getByLabel('HP').fill('7');
    await dialog.getByRole('button', { name: '추가', exact: true }).click();
    await expect(dialog).toBeHidden();

    // 첫 마리부터 번호가 붙는다.
    await expect(page.getByTestId('combatant-고블린 1')).toBeVisible();
    await expect(page.getByTestId('combatant-고블린 2')).toBeVisible();
    await expect(page.getByTestId('combatant-고블린 3')).toBeVisible();

    // ── 숫자 칸을 비워도 추가된다 ─────────────────────────────
    await page.getByRole('button', { name: '참가자', exact: true }).click();
    await dialog.getByRole('tab', { name: '즉석 참가자' }).click();
    await dialog.getByLabel('추가 수량').fill('');
    await dialog.getByLabel('이름').fill('빈칸 시험');
    await dialog.getByLabel('HP').fill('');
    await dialog.getByRole('button', { name: '추가', exact: true }).click();
    await expect(dialog).toBeHidden();

    const blank = page.getByTestId('combatant-빈칸 시험');
    await expect(blank).toBeVisible();
    // HP가 0/0인 참가자가 만들어지면 안 된다.
    await expect(blank).toContainText('10');

    // ── 이니셔티브와 전투 시작 ────────────────────────────────
    // 비어 있는 참가자 5명 모두 굴린다.
    await page.getByRole('button', { name: '전체 굴림', exact: true }).click();
    await expect(page.getByText(/이니셔티브를 굴렸습니다\. \(5명\)/)).toBeVisible();

    // 턴 순서를 확정하기 위해 직접 값을 넣는다.
    for (const [name, value] of [
      ['성난 군중', '20'],
      ['고블린 1', '18'],
      ['고블린 2', '16'],
      ['고블린 3', '14'],
      ['빈칸 시험', '12'],
    ] as const) {
      await page.getByRole('spinbutton', { name: `${name} 이니셔티브` }).fill(value);
      await expect(page.getByRole('spinbutton', { name: `${name} 이니셔티브` })).toHaveValue(value);
    }

    await page.getByRole('button', { name: '전투 시작', exact: true }).click();
    await expect(page.getByTestId('round-display')).toContainText('라운드 1');
    await expect(page.getByTestId('combatant-성난 군중')).toContainText('현재 차례');

    // ── 턴 진행 ───────────────────────────────────────────────
    await page.getByTestId('next-turn').click();
    await expect(page.getByTestId('combatant-고블린 1')).toContainText('현재 차례');

    await page.getByRole('button', { name: '라운드 증가' }).click();
    await expect(page.getByTestId('round-display')).toContainText('라운드 2');
    await page.getByRole('button', { name: '라운드 감소' }).click();
    await expect(page.getByTestId('round-display')).toContainText('라운드 1');

    // ── 피해 적용 ─────────────────────────────────────────────
    const crowd = page.getByTestId('combatant-성난 군중');
    await crowd.getByRole('spinbutton', { name: '성난 군중 HP 조정값' }).fill('9');
    await crowd.getByRole('button', { name: '피해', exact: true }).click();
    await expect(crowd).toContainText('15');

    // ── 상태 효과와 스택 ──────────────────────────────────────
    await crowd.getByRole('button', { name: '성난 군중 상태 추가' }).click();
    const conditionDialog = page.getByRole('dialog', { name: '성난 군중에게 상태 효과 적용' });
    await expect(conditionDialog).toBeVisible();
    await conditionDialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect(conditionDialog).toBeHidden();
    await expect(page.getByText('상태 효과를 적용했습니다.')).toBeVisible();

    const stackUp = crowd.getByRole('button', { name: /스택 1 늘리기/ });
    await stackUp.click();
    await expect(crowd.getByRole('button', { name: /2중첩 효과 설명 보기/ })).toBeVisible();

    await crowd.getByRole('button', { name: /스택 1 줄이기/ }).click();
    await expect(crowd.getByRole('button', { name: /2중첩 효과 설명 보기/ })).toHaveCount(0);

    // ── 참가자 제거 ───────────────────────────────────────────
    await page.getByRole('button', { name: '고블린 3 전투에서 제거' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '제거', exact: true }).click();
    await expect(page.getByTestId('combatant-고블린 3')).toHaveCount(0);

    // ── 세션을 벗어나지 않고 몬스터 만들고 고치기 ─────────────
    await page.getByRole('button', { name: '새 카드', exact: true }).click();
    const newCard = page.getByRole('dialog', { name: '새 카드' });
    await newCard.getByLabel('카드 이름').fill('세션 중 드레이크');
    await newCard.getByRole('button', { name: '만들기', exact: true }).click();

    // 만들자마자 편집 창이 열린다.
    const editor = page.getByRole('dialog', { name: '카드 편집' });
    await expect(editor).toBeVisible();
    await editor.getByRole('tab', { name: '능력치' }).click();
    await editor.getByLabel('최대 HP').fill('66');
    await editor.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(editor).toBeHidden();

    // 목록에서 이름을 눌러 다시 열면 값이 남아 있다.
    await page.getByTestId('edit-세션 중 드레이크').click();
    await expect(editor).toBeVisible();
    await editor.getByRole('tab', { name: '능력치' }).click();
    await expect(editor.getByLabel('최대 HP')).toHaveValue('66');
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(editor).toBeHidden();

    // 고친 값 그대로 전투에 들어간다.
    await page.getByRole('button', { name: '세션 중 드레이크 전투에 추가' }).click();
    // 같은 문구가 세션 로그에도 남으므로 알림 영역으로 한정한다.
    await expect(
      page.getByLabel('알림', { exact: true }).getByText('세션 중 드레이크을(를) 전투에 추가했습니다.'),
    ).toBeVisible();
    await expect(page.getByTestId('combatant-세션 중 드레이크')).toContainText('66');

    // ── 전투 종료 ─────────────────────────────────────────────
    await page.getByRole('button', { name: '전투 종료', exact: true }).click();
    await page.getByRole('button', { name: '전투 종료', exact: true }).last().click();
    await expect(page.getByRole('button', { name: '전투 만들기', exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
