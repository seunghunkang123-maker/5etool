import { useCampaign, useCharacters, useViewer } from '@/hooks/queries';
import { HpBar } from '@/components/ui/HpBar';
import { EmptyState } from '@/components/ui/feedback';
import { projectCharacterForViewer } from '@/domain/reveal';

/** 파티 상태판 — 캠페인 설정과 캐릭터별 공유 설정을 모두 만족하는 정보만 보여준다. */
export function PartyBoard({ campaignId }: { campaignId: string }) {
  const { data: campaign } = useCampaign(campaignId);
  const { data: characters = [] } = useCharacters(campaignId);
  const { viewer } = useViewer(campaignId);

  if (characters.length === 0) {
    return <EmptyState title="파티 정보가 없습니다" description="플레이어가 캐릭터를 만들면 여기에 표시됩니다." />;
  }

  const visibility = campaign?.party_visibility ?? { hp_numbers: true, ac: true, class_level: true };

  return (
    <section aria-label="파티 상태판">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">파티 상태</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {characters.map((character) => {
          const view = projectCharacterForViewer(character, viewer, visibility);
          return (
            <li key={character.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              {character.image_url ? (
                <img src={character.image_url} alt="" loading="lazy" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-3)]">
                  {view.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {view.name}
                  {view.isOwn ? <span className="ml-1 text-xs text-[var(--color-accent)]">(나)</span> : null}
                </p>
                {view.klass ? (
                  <p className="truncate text-xs text-[var(--color-fg-muted)]">
                    {view.klass} {view.level}레벨
                  </p>
                ) : null}
                <HpBar hp={view.hp} maxHp={view.max_hp} tempHp={view.temp_hp} tier={view.hp === null ? view.hp_tier : undefined} size="sm" />
              </div>
              {view.ac !== null ? (
                <span className="shrink-0 rounded-lg bg-[var(--color-surface-2)] px-2 py-1 text-center text-xs">
                  <span className="block text-[var(--color-fg-muted)]">AC</span>
                  <strong>{view.ac}</strong>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
