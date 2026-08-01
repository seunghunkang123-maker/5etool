import { expect, test } from '@playwright/test';

/**
 * 태그 관리와 캐릭터 삭제 E2E.
 */

const DM = { name: '정리DM', email: `tag-${Date.now()}@example.test`, password: 'test-password-1' };

test.describe('태그와 캐릭터 정리', () => {
  test.describe.configure({ mode: 'serial' });

  test('태그를 만들고 카드에 붙였다가 지우고, 캐릭터도 지운다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/signup');
    await page.getByLabel('표시 이름').fill(DM.name);
    await page.getByLabel('이메일').fill(DM.email);
    await page.getByLabel('비밀번호', { exact: true }).fill(DM.password);
    await page.getByLabel('비밀번호 확인').fill(DM.password);
    await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();

    await page.getByRole('button', { name: '새 캠페인', exact: true }).click();
    await page.getByLabel('캠페인 이름').fill('정리 캠페인');
    await page.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '정리 캠페인' })).toBeVisible();
    const campaignUrl = page.url();

    // ── 태그 만들기 ───────────────────────────────────────────
    await page.goto(`${campaignUrl}/library`);
    await page.getByRole('button', { name: '관리', exact: true }).click();

    const manager = page.getByRole('dialog', { name: '태그 관리' });
    await expect(manager).toBeVisible();
    await expect(manager.getByText('아직 태그가 없습니다')).toBeVisible();

    await manager.getByLabel('새 태그 이름').fill('1막');
    await manager.getByRole('button', { name: '추가', exact: true }).click();
    // 알림은 창 밖(앱 최상단)에 그려진다.
    await expect(page.getByText('"1막" 태그를 만들었습니다.')).toBeVisible();
    await expect(manager.getByLabel('1막 이름')).toHaveValue('1막');
    await expect(manager.getByText('사용 안 함')).toBeVisible();

    // 이름을 고치면 남는다.
    await manager.getByLabel('1막 이름').fill('제1막');
    await manager.getByLabel('새 태그 이름').click();
    await expect(manager.getByLabel('제1막 이름')).toBeVisible();
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(manager).toBeHidden();

    // 사이드바 필터에도 나온다.
    await expect(page.getByRole('button', { name: '제1막', exact: true })).toBeVisible();

    // ── 카드에 붙여 사용 개수를 확인 ──────────────────────────
    await page.getByRole('button', { name: '새 카드', exact: true }).click();
    await page.getByLabel('카드 이름').fill('태그 몬스터');
    await page.getByRole('button', { name: '만들기', exact: true }).click();

    const editor = page.getByRole('dialog', { name: '카드 편집' });
    await expect(editor).toBeVisible();
    // 태그 고르기는 토글 버튼이다.
    await editor.getByRole('button', { name: '제1막', exact: true }).click();
    await expect(editor.getByRole('button', { name: '제1막', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(editor).toBeHidden();

    await page.getByRole('button', { name: '관리', exact: true }).click();
    await expect(manager.getByText('카드 1장')).toBeVisible();

    // ── 태그 삭제 ─────────────────────────────────────────────
    await manager.getByRole('button', { name: '제1막 태그 삭제' }).click();
    const confirm = page.getByRole('dialog', { name: /제1막.*삭제할까요/ });
    await expect(confirm.getByText(/카드 1장에서 이 태그가 함께 떨어집니다/)).toBeVisible();
    await confirm.getByRole('button', { name: '삭제', exact: true }).click();

    await expect(page.getByText('태그를 삭제했습니다.')).toBeVisible();
    await expect(manager.getByText('아직 태그가 없습니다')).toBeVisible();
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();

    // 카드는 그대로 남는다.
    await expect(page.getByText('태그 몬스터').first()).toBeVisible();

    // ── 캐릭터 삭제 ───────────────────────────────────────────
    await page.goto(`${campaignUrl}/characters`);
    await page.getByRole('button', { name: '새 캐릭터', exact: true }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByLabel('캐릭터 이름')).toBeVisible();
    await sheet.getByLabel('캐릭터 이름').fill('지울 용사');
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();
    await expect(page.getByText('지울 용사')).toBeVisible();

    // ── 내성·기술 숙련과 주문 슬롯 ────────────────────────────
    await page.getByText('지울 용사').click();
    await expect(sheet.getByLabel('캐릭터 이름')).toBeVisible();

    // 레벨 5 → 숙련 보너스 +3
    await sheet.getByLabel('레벨').fill('5');
    await sheet.getByRole('tab', { name: '능력치' }).click();

    // 민첩 16 → 수정치 +3
    await sheet.getByLabel('민첩', { exact: true }).fill('16');

    // 은신에 전문성(숙련 보너스 2배) → 3 + 6 = +9
    await sheet.getByLabel('은신 숙련').selectOption('expertise');
    await expect(sheet.getByLabel('은신 최종 수정치')).toHaveText('+9');

    // 마법 물품 +1 → +10
    await sheet.getByLabel('은신 추가 보정').fill('1');
    await expect(sheet.getByLabel('은신 최종 수정치')).toHaveText('+10');

    // 바드의 재주꾼: 절반(내림) → 비전학은 지능 10(+0) + 1 = +1
    await sheet.getByLabel('비전학 숙련').selectOption('half');
    await expect(sheet.getByLabel('비전학 최종 수정치')).toHaveText('+1');

    // 민첩 내성 숙련 → 3 + 3 = +6
    await sheet.getByLabel('민첩 숙련').selectOption('proficient');
    await expect(sheet.getByLabel('민첩 최종 수정치')).toHaveText('+6');

    // 주문 슬롯 개수를 직접 정한다.
    await sheet.getByRole('tab', { name: '자원' }).click();
    await sheet.getByRole('button', { name: '슬롯 레벨 추가' }).click();
    await expect(sheet.getByRole('spinbutton', { name: '1레벨 슬롯 개수', exact: true })).toHaveValue('2');

    await sheet.getByRole('spinbutton', { name: '1레벨 슬롯 개수', exact: true }).fill('4');
    await expect(sheet.getByRole('button', { name: '1레벨 슬롯 4' })).toBeVisible();

    // 세 번째 칸까지 채운다.
    await sheet.getByRole('button', { name: '1레벨 슬롯 3' }).click();
    await expect(sheet.getByText('3 / 4')).toBeVisible();

    // 칸 수를 줄이면 남은 칸도 함께 줄어든다.
    await sheet.getByRole('button', { name: '1레벨 슬롯 개수 줄이기' }).click();
    await expect(sheet.getByRole('spinbutton', { name: '1레벨 슬롯 개수', exact: true })).toHaveValue('3');
    await expect(sheet.getByRole('button', { name: '1레벨 슬롯 4' })).toHaveCount(0);
    await expect(sheet.getByText('3 / 3')).toBeVisible();

    await page.getByRole('button', { name: '닫기', exact: true }).last().click();

    // 새로고침해도 남아 있다.
    await page.reload();
    await page.getByText('지울 용사').click();
    await sheet.getByRole('tab', { name: '능력치' }).click();
    await expect(sheet.getByLabel('은신 숙련')).toHaveValue('expertise');
    await expect(sheet.getByLabel('은신 최종 수정치')).toHaveText('+10');
    await sheet.getByRole('tab', { name: '자원' }).click();
    await expect(sheet.getByRole('spinbutton', { name: '1레벨 슬롯 개수', exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: '닫기', exact: true }).last().click();

    await page.getByRole('button', { name: '지울 용사 삭제' }).click();
    const charConfirm = page.getByRole('dialog', { name: /지울 용사.*삭제할까요/ });
    await expect(charConfirm.getByText(/되돌릴 수 없습니다/)).toBeVisible();
    await charConfirm.getByRole('button', { name: '삭제', exact: true }).click();

    await expect(page.getByText('캐릭터를 삭제했습니다.')).toBeVisible();
    await expect(page.getByText('지울 용사')).toHaveCount(0);

    // 새로고침해도 지워진 상태다.
    await page.reload();
    await expect(page.getByText('지울 용사')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
