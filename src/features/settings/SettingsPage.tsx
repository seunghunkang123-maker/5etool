import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Trash2 } from 'lucide-react';
import { repo, isDemoMode } from '@/data';
import { useAuthStore } from '@/stores/auth';
import { DENSITY_LABELS, NOTIFICATION_CHANNEL_LABELS, THEME_LABELS, usePreferences } from '@/stores/preferences';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { SHORTCUT_HELP } from '@/hooks/useShortcuts';
import { AvatarPicker } from './AvatarPicker';
import type { Density, NotificationPrefs, ThemeMode } from '@/data/types';

export function SettingsPage() {
  const navigate = useNavigate();
  const { profile, user, refresh } = useAuthStore();
  const prefs = usePreferences();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await repo().auth.updateProfile({ display_name: displayName.trim() });
      await refresh();
      toast.success('프로필을 저장했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const requestBrowserPermission = async (enabled: boolean) => {
    if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.warning('브라우저 알림 권한이 허용되지 않았습니다. 앱 내부 알림은 계속 표시됩니다.');
        return;
      }
    }
    void prefs.update({ notification_prefs: { ...prefs.notification_prefs, browser: enabled } });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-bold">설정</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">프로필</h2>
        <AvatarPicker />
        <Field label="표시 이름">
          {({ id }) => <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
        </Field>
        <Field label="이메일" hint="이메일은 변경할 수 없습니다.">
          {({ id }) => <Input id={id} value={user?.email ?? ''} disabled />}
        </Field>
        <Button variant="primary" onClick={saveProfile} loading={busy} className="self-start">
          프로필 저장
        </Button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">화면</h2>
        <Field label="테마">
          {({ id }) => (
            <Select id={id} value={prefs.theme} onChange={(e) => void prefs.update({ theme: e.target.value as ThemeMode })}>
              {(Object.keys(THEME_LABELS) as ThemeMode[]).map((value) => (
                <option key={value} value={value}>
                  {THEME_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="화면 밀도">
          {({ id }) => (
            <Select id={id} value={prefs.density} onChange={(e) => void prefs.update({ density: e.target.value as Density })}>
              {(Object.keys(DENSITY_LABELS) as Density[]).map((value) => (
                <option key={value} value={value}>
                  {DENSITY_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="글자 크기" hint={`${Math.round(prefs.font_scale * 100)}%`}>
          {({ id }) => (
            <input
              id={id}
              type="range"
              min={0.85}
              max={1.4}
              step={0.05}
              value={prefs.font_scale}
              onChange={(e) => void prefs.update({ font_scale: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
          )}
        </Field>
        <Checkbox
          label="애니메이션 줄이기"
          hint="시스템의 '동작 줄이기' 설정도 함께 적용됩니다."
          checked={prefs.reduce_motion}
          onChange={(e) => void prefs.update({ reduce_motion: e.target.checked })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">알림</h2>
        {(Object.keys(NOTIFICATION_CHANNEL_LABELS) as (keyof NotificationPrefs)[]).map((channel) => (
          <Checkbox
            key={channel}
            label={NOTIFICATION_CHANNEL_LABELS[channel]}
            checked={prefs.notification_prefs[channel]}
            onChange={(e) => {
              if (channel === 'browser') void requestBrowserPermission(e.target.checked);
              else void prefs.update({ notification_prefs: { ...prefs.notification_prefs, [channel]: e.target.checked } });
            }}
          />
        ))}
        <p className="text-xs text-[var(--color-fg-muted)]">
          소리 알림을 켜도 화면에 항상 시각적 알림이 함께 표시됩니다.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">키보드 단축키</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          {SHORTCUT_HELP.map((item) => (
            <div key={item.keys} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
              <dt className="text-[var(--color-fg-muted)]">{item.description}</dt>
              <dd>
                <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-xs">{item.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-[var(--color-danger)]/40 p-4">
        <h2 className="text-lg font-semibold text-[var(--color-danger)]">계정</h2>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            confirmAndRun(
              { title: '모든 기기에서 로그아웃할까요?', description: '다른 브라우저와 기기의 세션이 모두 종료됩니다.', confirmLabel: '로그아웃' },
              async () => {
                await repo().auth.signOutEverywhere();
                navigate('/login');
              },
            )
          }
        >
          <LogOut aria-hidden className="h-4 w-4" />
          모든 기기에서 로그아웃
        </Button>

        <Button
          variant="danger"
          className="self-start"
          onClick={() =>
            confirmAndRun(
              {
                title: '계정을 삭제할까요?',
                description: isDemoMode
                  ? '이 브라우저에 저장된 데모 계정과 데이터가 삭제됩니다.'
                  : '내가 소유한 캠페인과 자료가 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
                confirmLabel: '계정 삭제',
                danger: true,
              },
              async () => {
                await repo().auth.deleteAccount();
                navigate('/login');
              },
            )
          }
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          계정 탈퇴
        </Button>
      </section>
    </div>
  );
}
