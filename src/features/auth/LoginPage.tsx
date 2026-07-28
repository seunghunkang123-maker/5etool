import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthLayout } from './AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { repo } from '@/data';
import { useAuthStore } from '@/stores/auth';
import { toUserMessage } from '@/lib/errors';

const schema = z.object({
  email: z.string().min(1, '이메일을 입력해 주세요.').email('이메일 형식이 올바르지 않습니다.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuthStore();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await repo().auth.signIn(values.email, values.password);
      await refresh();
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(toUserMessage(error, '로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.'));
    }
  });

  return (
    <AuthLayout
      title="로그인"
      description="계정으로 로그인하고 캠페인을 이어가세요."
      footer={
        <>
          계정이 없으신가요?{' '}
          <Link to="/signup" className="font-medium text-[var(--color-accent)] underline">
            회원가입
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="이메일" error={errors.email?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              placeholder="you@example.com"
              {...register('email')}
            />
          )}
        </Field>

        <Field label="비밀번호" error={errors.password?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              {...register('password')}
            />
          )}
        </Field>

        {formError ? (
          <p role="alert" className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="justify-center">
          로그인
        </Button>

        <Link to="/reset-password" className="text-center text-sm text-[var(--color-fg-muted)] underline">
          비밀번호를 잊으셨나요?
        </Link>
      </form>
    </AuthLayout>
  );
}
