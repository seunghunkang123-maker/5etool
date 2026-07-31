import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/data/repository';
import { runOrToast, toUserMessage } from './errors';

describe('runOrToast', () => {
  it('성공하면 true를 주고 메시지를 띄우지 않는다', async () => {
    const onError = vi.fn();
    await expect(runOrToast(async () => 'ok', onError)).resolves.toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('실패하면 false를 주고 반드시 메시지를 띄운다', async () => {
    const onError = vi.fn();
    const failed = await runOrToast(async () => {
      throw new AppError('참가자를 추가할 권한이 없습니다.', 'forbidden');
    }, onError);

    expect(failed).toBe(false);
    expect(onError).toHaveBeenCalledWith('참가자를 추가할 권한이 없습니다.');
  });

  it('알 수 없는 오류에는 넘겨준 기본 문구를 쓴다', async () => {
    const onError = vi.fn();
    await runOrToast(
      async () => {
        throw new Error('boom');
      },
      onError,
      '전투에 추가하지 못했습니다.',
    );
    expect(onError).toHaveBeenCalledWith('전투에 추가하지 못했습니다.');
  });
});

describe('toUserMessage', () => {
  it('AppError의 한국어 메시지를 그대로 쓴다', () => {
    expect(toUserMessage(new AppError('전투를 찾을 수 없습니다.', 'not_found'))).toBe('전투를 찾을 수 없습니다.');
  });

  it('메시지가 없으면 코드에 맞는 안내를 쓴다', () => {
    expect(toUserMessage(new AppError('', 'forbidden'))).toMatch(/권한/);
  });
});
