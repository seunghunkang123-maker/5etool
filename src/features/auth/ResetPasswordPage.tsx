import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { repo, isDemoMode } from '@/data';
import { toUserMessage } from '@/lib/errors';

export function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await repo().auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(toUserMessage(err, '재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="비밀번호 재설정"
      description="가입한 이메일로 재설정 링크를 보내드립니다."
      footer={
        <Link to="/login" className="font-medium text-[var(--color-accent)] underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="rounded-lg bg-[var(--color-success)]/10 px-3 py-3 text-sm text-[var(--color-fg)]">
          {isDemoMode
            ? '데모 모드에서는 메일을 보내지 않습니다. 운영 환경에서는 Supabase가 재설정 메일을 발송합니다.'
            : '재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.'}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="이메일" required error={error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                required
                autoComplete="email"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} className="justify-center">
            재설정 링크 보내기
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
