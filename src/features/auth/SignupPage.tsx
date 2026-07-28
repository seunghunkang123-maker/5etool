import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthLayout } from './AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { repo, isDemoMode } from '@/data';
import { useAuthStore } from '@/stores/auth';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/components/ui/Toast';

const schema = z
  .object({
    displayName: z.string().min(1, '표시 이름을 입력해 주세요.').max(40, '표시 이름은 40자 이내로 입력해 주세요.'),
    email: z.string().min(1, '이메일을 입력해 주세요.').email('이메일 형식이 올바르지 않습니다.'),
    password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(72, '비밀번호가 너무 깁니다.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

export function SignupPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuthStore();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirm: '' },
  });

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const state = await repo().auth.signUp(values.email, values.password, values.displayName);
      await refresh();
      if (state.user) {
        navigate('/', { replace: true });
      } else {
        toast.info('인증 메일을 보냈습니다. 메일함을 확인한 뒤 로그인해 주세요.');
        navigate('/login', { replace: true });
      }
    } catch (error) {
      setFormError(toUserMessage(error, '회원가입에 실패했습니다. 입력값을 확인해 주세요.'));
    }
  });

  return (
    <AuthLayout
      title="회원가입"
      description={isDemoMode ? '데모 계정은 이 브라우저에만 저장됩니다.' : '이메일 인증 후 바로 캠페인을 시작할 수 있습니다.'}
      footer={
        <>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-medium text-[var(--color-accent)] underline">
            로그인
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="표시 이름" error={errors.displayName?.message} required hint="다른 참가자에게 보이는 이름입니다.">
          {({ id, describedBy, invalid }) => (
            <Input id={id} autoComplete="nickname" aria-describedby={describedBy} aria-invalid={invalid} {...register('displayName')} />
          )}
        </Field>

        <Field label="이메일" error={errors.email?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} aria-invalid={invalid} {...register('email')} />
          )}
        </Field>

        <Field label="비밀번호" error={errors.password?.message} required hint="8자 이상 입력해 주세요.">
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid} {...register('password')} />
          )}
        </Field>

        <Field label="비밀번호 확인" error={errors.confirm?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid} {...register('confirm')} />
          )}
        </Field>

        {formError ? (
          <p role="alert" className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {formError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="justify-center">
          계정 만들기
        </Button>
      </form>
    </AuthLayout>
  );
}
