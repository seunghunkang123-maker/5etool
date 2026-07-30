import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, Download, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCampaign, useViewer } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { Badge, CardListSkeleton, EmptyState } from '@/components/ui/feedback';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { isOwner } from '@/domain/permissions';
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, type Campaign } from '@/data/types';
import { THEME_COLOR_LABELS, THEME_COLORS } from './themeColor';
import type { ImportPreview, ImportStrategy } from '@/data/repository';
import { formatDateTime } from '@/lib/format';
import { downloadJson } from '@/lib/download';

export function CampaignSettingsPage() {
  const { campaignId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { viewer } = useViewer(campaignId);
  const [importPreview, setImportPreview] = useState<{ preview: ImportPreview; data: unknown } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: trash = [] } = useQuery({
    queryKey: qk.trash(campaignId),
    queryFn: () => repo().campaigns.trash(campaignId),
    enabled: Boolean(campaignId),
  });
  const { data: auditLogs = [] } = useQuery({
    queryKey: qk.audit(campaignId),
    queryFn: () => repo().campaigns.auditLogs(campaignId),
    enabled: Boolean(campaignId) && isOwner(viewer),
    retry: false,
  });

  if (isLoading || !campaign) return <CardListSkeleton rows={4} />;

  const save = async (patch: Partial<Campaign>) => {
    try {
      await repo().campaigns.update(campaignId, patch);
      await client.invalidateQueries({ queryKey: qk.campaign(campaignId) });
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  const exportCampaign = async () => {
    try {
      const data = await repo().campaigns.exportData(campaignId);
      downloadJson(`${campaign.name}-백업.json`, data);
      toast.success('캠페인 데이터를 내려받았습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  const onPickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      const preview = await repo().campaigns.previewImport(data);
      setImportPreview({ preview, data });
    } catch (error) {
      toast.error(toUserMessage(error, '파일을 읽지 못했습니다. 앱에서 내보낸 JSON인지 확인해 주세요.'));
    } finally {
      event.target.value = '';
    }
  };

  const runImport = async (strategy: ImportStrategy) => {
    if (!importPreview) return;
    try {
      await repo().campaigns.importData(campaignId, importPreview.data, strategy);
      await client.invalidateQueries({ queryKey: ['cards', campaignId] });
      toast.success('데이터를 가져왔습니다.');
      setImportPreview(null);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  const duplicate = () =>
    confirmAndRun(
      { title: '캠페인을 복제할까요?', description: '자료와 폴더가 복사되며, 모든 카드는 비공개 상태로 시작합니다.' },
      async () => {
        const clone = await repo().campaigns.duplicate(campaignId, `${campaign.name} (사본)`);
        await client.invalidateQueries({ queryKey: qk.campaigns });
        navigate(`/campaigns/${clone.id}`);
      },
      '캠페인을 복제했습니다.',
    );

  const softDelete = () =>
    confirmAndRun(
      {
        title: '캠페인을 삭제할까요?',
        description: '즉시 영구 삭제되지 않고 휴지통으로 이동합니다. 30일 안에 복구할 수 있습니다.',
        confirmLabel: '휴지통으로 이동',
        danger: true,
      },
      async () => {
        await repo().campaigns.softDelete(campaignId);
        await client.invalidateQueries({ queryKey: qk.campaigns });
        navigate('/');
      },
      '캠페인을 휴지통으로 옮겼습니다.',
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">캠페인 설정</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">변경 사항은 입력을 마치면 자동으로 저장됩니다.</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">기본 정보</h2>
        <Field label="캠페인 이름">
          {({ id }) => <Input id={id} defaultValue={campaign.name} onBlur={(e) => save({ name: e.target.value })} />}
        </Field>
        <Field label="설명">
          {({ id }) => <Textarea id={id} rows={3} defaultValue={campaign.description} onBlur={(e) => save({ description: e.target.value })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="캠페인 상태">
            {({ id }) => (
              <Select id={id} defaultValue={campaign.status} onChange={(e) => save({ status: e.target.value as Campaign['status'] })}>
                {CAMPAIGN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CAMPAIGN_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="최대 플레이어 수">
            {({ id }) => (
              <Input id={id} type="number" min={1} max={20} defaultValue={campaign.max_players} onBlur={(e) => save({ max_players: Number(e.target.value) })} />
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">강조 색상</legend>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
            이 캠페인에 들어와 있는 동안 앱의 강조 색이 바뀝니다. 여러 캠페인을 오갈 때 구분하기 쉬워집니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {THEME_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`강조 색상 ${THEME_COLOR_LABELS[color] ?? color}`}
                aria-pressed={campaign.theme_color === color}
                onClick={() => save({ theme_color: color })}
                className="h-10 w-10 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: color,
                  borderColor: campaign.theme_color === color ? 'var(--color-fg)' : 'transparent',
                  transform: campaign.theme_color === color ? 'scale(1.1)' : undefined,
                }}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">파티 상태판 공개 범위</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">플레이어끼리 서로의 캐릭터 정보를 어디까지 볼 수 있는지 정합니다.</p>
        {(
          [
            ['hp_numbers', '정확한 HP 수치 (끄면 부상 단계만 표시)'],
            ['ac', '방어도'],
            ['conditions', '상태 효과'],
            ['concentration', '집중 여부'],
            ['class_level', '클래스와 레벨'],
          ] as const
        ).map(([key, label]) => (
          <Checkbox
            key={key}
            label={label}
            checked={campaign.party_visibility[key]}
            onChange={(e) => save({ party_visibility: { ...campaign.party_visibility, [key]: e.target.checked } })}
          />
        ))}
        <Checkbox
          label="플레이어의 메모 작성 허용"
          checked={campaign.allow_player_notes}
          onChange={(e) => save({ allow_player_notes: e.target.checked })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">데이터</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCampaign}>
            <Download aria-hidden className="h-4 w-4" />
            JSON으로 내보내기
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden className="h-4 w-4" />
            백업 파일에서 가져오기
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={onPickFile} aria-label="백업 파일 선택" />
          <Button variant="secondary" onClick={duplicate}>
            <Copy aria-hidden className="h-4 w-4" />
            캠페인 복제
          </Button>
          <Button variant="secondary" onClick={() => save({ status: 'archived' })}>
            <Archive aria-hidden className="h-4 w-4" />
            보관하기
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">휴지통</h2>
        {trash.length === 0 ? (
          <EmptyState title="휴지통이 비어 있습니다" description="삭제한 카드와 폴더는 30일 동안 여기에 보관됩니다." />
        ) : (
          <ul className="flex flex-col gap-2">
            {trash.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <span className="text-sm">
                  <Badge>{item.entity_type}</Badge> <strong className="ml-2">{item.label}</strong>
                  <span className="ml-2 text-xs text-[var(--color-fg-muted)]">{formatDateTime(item.deleted_at)} 삭제</span>
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await repo().campaigns.restoreItem(item.id);
                      await client.invalidateQueries({ queryKey: qk.trash(campaignId) });
                      await client.invalidateQueries({ queryKey: ['cards', campaignId] });
                      toast.success('복구했습니다.');
                    }}
                  >
                    복구
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirmAndRun(
                        { title: '영구 삭제할까요?', description: '이 작업은 되돌릴 수 없습니다.', danger: true, confirmLabel: '영구 삭제' },
                        async () => {
                          await repo().campaigns.purgeItem(item.id);
                          await client.invalidateQueries({ queryKey: qk.trash(campaignId) });
                        },
                        '영구 삭제했습니다.',
                      )
                    }
                  >
                    영구 삭제
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner(viewer) ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert aria-hidden className="h-5 w-5" />
            감사 로그
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">기록된 관리자 작업이 없습니다.</p>
          ) : (
            <ul className="scroll-area max-h-72 divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {auditLogs.map((log) => (
                <li key={log.id} className="px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-[var(--color-fg-muted)]">{formatDateTime(log.created_at)}</span>{' '}
                  <strong>{log.actor_name}</strong> · {log.action}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isOwner(viewer) ? (
        <section className="rounded-xl border border-[var(--color-danger)]/40 p-4">
          <h2 className="text-lg font-semibold text-[var(--color-danger)]">위험 구역</h2>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            삭제해도 즉시 사라지지 않습니다. 30일 안에 휴지통에서 복구할 수 있습니다.
          </p>
          <Button variant="danger" className="mt-3" onClick={softDelete}>
            <Trash2 aria-hidden className="h-4 w-4" />
            캠페인 삭제
          </Button>
        </section>
      ) : null}

      {importPreview ? (
        <Dialog
          open
          onClose={() => setImportPreview(null)}
          title="가져오기 미리보기"
          description="중복된 이름이 있을 때 처리 방식을 선택하세요."
          footer={
            <>
              <Button variant="ghost" onClick={() => setImportPreview(null)}>
                취소
              </Button>
              <Button variant="secondary" onClick={() => runImport('skip')}>
                건너뛰기
              </Button>
              <Button variant="secondary" onClick={() => runImport('duplicate')}>
                복사본 생성
              </Button>
              <Button variant="primary" onClick={() => runImport('overwrite')}>
                덮어쓰기
              </Button>
            </>
          }
        >
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt>캠페인</dt>
              <dd className="font-medium">{importPreview.preview.campaignName}</dd>
            </div>
            <div className="flex justify-between">
              <dt>폴더</dt>
              <dd>{importPreview.preview.folders}개</dd>
            </div>
            <div className="flex justify-between">
              <dt>태그</dt>
              <dd>{importPreview.preview.tags}개</dd>
            </div>
            <div className="flex justify-between">
              <dt>카드</dt>
              <dd>{importPreview.preview.cards}개</dd>
            </div>
            <div className="flex justify-between">
              <dt>이름이 겹치는 항목</dt>
              <dd className="font-medium text-[var(--color-warning)]">{importPreview.preview.conflicts.length}개</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-[var(--color-fg-muted)]">가져온 카드는 모두 비공개 상태로 저장됩니다.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
