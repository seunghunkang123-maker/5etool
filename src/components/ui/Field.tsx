import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useImeInput } from '@/hooks/useImeInput';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] ' +
  'placeholder:text-[var(--color-fg-muted)] focus:border-[var(--color-accent)] disabled:opacity-60';

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** 레이블 · 도움말 · 오류 메시지를 입력 요소와 연결한다. */
export function Field({ label, hint, error, required, children, className }: FieldWrapperProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* 필수 표시(*)는 label 밖에 두어 접근 가능한 이름을 오염시키지 않는다. */}
      <span className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-medium text-[var(--color-fg)]">
          {label}
        </label>
        {required ? (
          <span className="text-[var(--color-danger)]" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(필수 입력)</span> : null}
      </span>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, value, onChange, ...props },
  ref,
) {
  // 한글 조합 중에 커서가 튀지 않도록 조합이 끝난 뒤에 값을 올려보낸다.
  const ime = useImeInput<HTMLInputElement>(value, onChange);
  return <input ref={ref} className={cn(CONTROL, className)} value={value} onChange={onChange} {...props} {...ime} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, value, onChange, ...props },
  ref,
) {
  const ime = useImeInput<HTMLTextAreaElement>(value, onChange);
  return (
    <textarea ref={ref} className={cn(CONTROL, 'min-h-24 resize-y', className)} value={value} onChange={onChange} {...props} {...ime} />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(CONTROL, 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
});

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  hint?: string;
}

export function Checkbox({ label, hint, className, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
        {...props}
      />
      <label htmlFor={id} className="text-sm text-[var(--color-fg)]">
        {label}
        {hint ? <span className="block text-xs text-[var(--color-fg-muted)]">{hint}</span> : null}
      </label>
    </div>
  );
}
