import { expect, test } from '@playwright/test';

/**
 * 설정 화면 E2E — 프로필 이미지와 캠페인 강조 색상.
 *
 * 데모 모드로 실행한다. 실제 Supabase Storage 업로드는 여기서 검증하지 못하지만,
 * 파일 선택 → 검증 → 저장 → 화면 반영까지의 경로는 동일하다.
 */

const USER = {
  name: '설정테스터',
  email: `settings-${Date.now()}@example.test`,
  password: 'test-password-1',
};

// 1x1 투명 PNG. 실제 이미지 파일이어야 MIME 검증을 통과한다.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('설정', () => {
  test.describe.configure({ mode: 'serial' });

  test('프로필 이미지를 올리고 지울 수 있고, 캠페인 강조 색상이 적용된다', async ({ page }) => {
    page.on('pageerror', (error) => console.log('페이지 오류:', error.message));

    // ── 가입 ──────────────────────────────────────────────────
    await page.goto('/signup');
    await page.getByLabel('표시 이름').fill(USER.name);
    await page.getByLabel('이메일').fill(USER.email);
    await page.getByLabel('비밀번호', { exact: true }).fill(USER.password);
    await page.getByLabel('비밀번호 확인').fill(USER.password);
    await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();

    // ── 프로필 이미지 업로드 ──────────────────────────────────
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();

    // 업로드 전에는 이미지가 아니라 첫 글자가 보인다.
    await expect(page.locator('img[src^="data:image"]')).toHaveCount(0);

    await page.getByLabel('프로필 이미지 파일 선택').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });

    await expect(page.getByText('프로필 이미지를 변경했습니다.')).toBeVisible();
    // 설정 화면과 상단바 양쪽에 반영된다.
    await expect(page.locator('img[src^="data:image"]')).toHaveCount(2);

    // ── 허용하지 않는 형식은 거부한다 ─────────────────────────
    await page.getByLabel('프로필 이미지 파일 선택').setInputFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByText('PNG, JPEG, WebP 이미지만 사용할 수 있습니다.')).toBeVisible();
    // 거부돼도 기존 이미지는 그대로 남는다.
    await expect(page.locator('img[src^="data:image"]')).toHaveCount(2);

    // ── 삭제 ──────────────────────────────────────────────────
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.getByText('프로필 이미지를 삭제했습니다.')).toBeVisible();
    await expect(page.locator('img[src^="data:image"]')).toHaveCount(0);

    // ── 캠페인 강조 색상 ──────────────────────────────────────
    await page.goto('/campaigns/new');
    await page.getByLabel('캠페인 이름').fill('색상 확인 캠페인');
    await page.getByRole('button', { name: '캠페인 만들기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '색상 확인 캠페인' })).toBeVisible();

    const campaignUrl = page.url();
    await page.goto(`${campaignUrl}/settings`);

    const teal = page.getByRole('button', { name: '강조 색상 청록' });
    await teal.click();
    // 캠페인 설정은 자동 저장이라 별도 알림이 없다. 선택 상태로 반영을 확인한다.
    await expect(teal).toHaveAttribute('aria-pressed', 'true');

    // 캠페인 안에서는 강조 색이 그 캠페인 색으로 바뀐다.
    const accent = () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--color-accent').trim());
    await expect.poll(accent).toBe('#0f766e');

    // 캠페인을 벗어나면 원래 색으로 돌아온다.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
    await expect.poll(accent).toBe('');
  });
});
