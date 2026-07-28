import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { repo } from '@/data';
import { qk } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { SYSTEM_OPTIONS } from '@/domain/systems';
import { toast } from '@/components/ui/Toast';

const schema = z.object({
  name: z.string().min(1, '캠페인 이름을 입력해 주세요.').max(80, '이름은 80자 이내로 입력해 주세요.'),
  description: z.string().max(2000, '설명은 2000자 이내로 입력해 주세요.'),
  system: z.string(),
  theme_color: z.string(),
  max_players: z.coerce.number().int().min(1, '최소 1명이어야 합니다.').max(20, '최대 20명까지 가능합니다.'),
  join_policy: z.enum(['code', 'invite_only', 'request']),
  is_mature: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const THEME_COLORS = ['#7c3aed', '#0f766e', '#b91c1c', '#1d4ed8', '#a16207', '#4d7c0f'];

export function CampaignCreatePage() {
  const navigate = useNavigate();
  const client = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      system: 'dnd5e',
      theme_color: '#7c3aed',
      max_players: 6,
      join_policy: 'code',
      is_mature: false,
    },
  });

  const themeColor = watch('theme_color');

  const onSubmit = handleSubmit(async (values) => {
    const campaign = await repo().campaigns.create(values);
    await client.invalidateQueries({ queryKey: qk.campaigns });
    toast.success('캠페인을 만들었습니다. 참여 코드를 플레이어에게 알려주세요.');
    navigate(`/campaigns/${campaign.id}`);
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">새 캠페인</h1>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        나중에 언제든 설정에서 변경할 수 있습니다. 이름만 정하고 바로 시작해도 됩니다.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
        <Field label="캠페인 이름" required error={errors.name?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} placeholder="예: 잊혀진 왕국의 그림자" {...register('name')} />
          )}
        </Field>

        <Field label="설명" error={errors.description?.message} hint="플레이어에게 보이는 소개글입니다.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} rows={4} {...register('description')} />}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="TRPG 시스템" hint="D&D 5e 외 시스템은 범용 규칙으로 동작합니다.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} {...register('system')}>
                {SYSTEM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="최대 플레이어 수" error={errors.max_players?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="number" min={1} max={20} aria-describedby={describedBy} aria-invalid={invalid} {...register('max_players')} />
            )}
          </Field>
        </div>

        <Field label="참여 방식">
          {({ id }) => (
            <Select id={id} {...register('join_policy')}>
              <option value="code">참여 코드로 누구나 참여</option>
              <option value="invite_only">초대받은 사람만</option>
              <option value="request">참여 요청 후 승인</option>
            </Select>
          )}
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">테마 색상</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {THEME_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`테마 색상 ${color}`}
                aria-pressed={themeColor === color}
                onClick={() => setValue('theme_color', color)}
                className="h-10 w-10 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: color,
                  borderColor: themeColor === color ? 'var(--color-fg)' : 'transparent',
                  transform: themeColor === color ? 'scale(1.1)' : undefined,
                }}
              />
            ))}
          </div>
        </fieldset>

        <Checkbox label="성인 콘텐츠 포함" hint="참여 전 플레이어에게 안내가 표시됩니다." {...register('is_mature')} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            취소
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            캠페인 만들기
          </Button>
        </div>
      </form>
    </div>
  );
}
