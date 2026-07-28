import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCampaign, useCharacters, useViewer } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { CardListSkeleton, EmptyState } from '@/components/ui/feedback';
import { HpBar } from '@/components/ui/HpBar';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { isDM } from '@/domain/permissions';
import { projectCharacterForViewer } from '@/domain/reveal';
import { CharacterSheet } from './CharacterSheet';
import type { PlayerCharacter } from '@/data/types';

export function CharactersPage() {
  const { campaignId = '' } = useParams();
  const client = useQueryClient();
  const { data: campaign } = useCampaign(campaignId);
  const { data: characters = [], isLoading } = useCharacters(campaignId);
  const { viewer } = useViewer(campaignId);
  const [editing, setEditing] = useState<PlayerCharacter | null>(null);

  const mine = characters.filter((c) => c.user_id === viewer?.userId);
  const others = characters.filter((c) => c.user_id !== viewer?.userId);

  const create = async () => {
    try {
      const character = await repo().characters.create(campaignId, { name: '새 캐릭터' });
      await client.invalidateQueries({ queryKey: qk.characters(campaignId) });
      setEditing(character);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  if (isLoading) return <CardListSkeleton rows={3} />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">캐릭터</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            내 캐릭터는 언제든 수정할 수 있습니다. 다른 캐릭터는 캠페인 공개 설정에 따라 표시됩니다.
          </p>
        </div>
        <Button variant="primary" onClick={create}>
          <Plus aria-hidden className="h-4 w-4" />새 캐릭터
        </Button>
      </header>

      {characters.length === 0 ? (
        <EmptyState title="아직 캐릭터가 없습니다" description="캐릭터를 만들면 세션 중 HP와 자원을 직접 관리할 수 있습니다." action={{ label: '캐릭터 만들기', onClick: create }} />
      ) : (
        <>
          <CharacterGrid title="내 캐릭터" characters={mine} onSelect={setEditing} campaignId={campaignId} viewerId={viewer?.userId} isDm={isDM(viewer)} partyVisibility={campaign?.party_visibility} />
          <CharacterGrid title="파티" characters={others} onSelect={setEditing} campaignId={campaignId} viewerId={viewer?.userId} isDm={isDM(viewer)} partyVisibility={campaign?.party_visibility} />
        </>
      )}

      {editing ? (
        <CharacterSheet
          character={editing}
          campaignId={campaignId}
          onClose={() => {
            setEditing(null);
            void client.invalidateQueries({ queryKey: qk.characters(campaignId) });
          }}
        />
      ) : null}
    </div>
  );
}

function CharacterGrid({
  title,
  characters,
  onSelect,
  viewerId,
  isDm,
  partyVisibility,
}: {
  title: string;
  characters: PlayerCharacter[];
  onSelect: (character: PlayerCharacter) => void;
  campaignId: string;
  viewerId: string | undefined;
  isDm: boolean;
  partyVisibility: { hp_numbers: boolean; ac: boolean; class_level: boolean } | undefined;
}) {
  if (characters.length === 0) return null;
  const visibility = partyVisibility ?? { hp_numbers: true, ac: true, class_level: true };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((character) => {
          const view = projectCharacterForViewer(
            character,
            viewerId ? { userId: viewerId, role: isDm ? 'owner' : 'player', permissions: {} } : null,
            visibility,
          );
          return (
            <li key={character.id}>
              <button
                type="button"
                onClick={() => onSelect(character)}
                disabled={!view.canEdit}
                className="flex w-full flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left disabled:cursor-default"
              >
                <div className="flex items-center gap-3">
                  {character.image_url ? (
                    <img src={character.image_url} alt="" className="h-12 w-12 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-3)] text-lg">
                      {character.name.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{view.name}</p>
                    <p className="truncate text-xs text-[var(--color-fg-muted)]">
                      {view.klass ? `${view.klass} ${view.level ?? ''}레벨` : '정보 비공개'}
                    </p>
                  </div>
                  {view.ac !== null ? (
                    <span className="ml-auto rounded-lg bg-[var(--color-surface-2)] px-2 py-1 text-center text-xs">
                      <span className="block text-[var(--color-fg-muted)]">AC</span>
                      <strong className="text-base">{view.ac}</strong>
                    </span>
                  ) : null}
                </div>
                <HpBar hp={view.hp} maxHp={view.max_hp} tempHp={view.temp_hp} tier={view.hp === null ? view.hp_tier : undefined} />
                {view.canEdit ? <span className="text-xs font-medium text-[var(--color-accent)]">시트 열기 →</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
