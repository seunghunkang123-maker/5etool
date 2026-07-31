import { useEffect, useMemo, useRef } from 'react';
import { Sparkles, Swords } from 'lucide-react';
import { useCharacters, useCombatants, useEncounter, useViewer } from '@/hooks/queries';
import { Badge } from '@/components/ui/feedback';
import { ConditionBadge } from '@/features/conditions/ConditionBadge';
import { HpBar } from '@/components/ui/HpBar';
import { turnOrder } from '@/domain/initiative';
import { projectCombatantForViewer } from '@/domain/reveal';
import type { Campaign } from '@/data/types';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/Toast';

/**
 * 플레이어/관전자용 이니셔티브 표시.
 * 자신의 차례가 되면 눈에 띄게 알린다.
 */
export function InitiativeTracker({ sessionId, campaignId, campaign }: { sessionId: string; campaignId: string; campaign: Campaign | undefined }) {
  const { data: encounter } = useEncounter(sessionId);
  const { data: combatants = [] } = useCombatants(encounter?.id);
  const { data: characters = [] } = useCharacters(campaignId);
  const { viewer } = useViewer(campaignId);

  const myCharacterIds = useMemo(
    () => characters.filter((c) => c.user_id === viewer?.userId).map((c) => c.id),
    [characters, viewer?.userId],
  );

  const order = useMemo(() => turnOrder(combatants, encounter?.tiebreak_rule ?? 'dex_mod'), [combatants, encounter?.tiebreak_rule]);

  const visible = order
    .map((combatant) =>
      projectCombatantForViewer(combatant, viewer, {
        partyHpNumbers: campaign?.party_visibility.hp_numbers,
        partyAc: campaign?.party_visibility.ac,
        partyConditions: campaign?.party_visibility.conditions,
        ownCharacterIds: myCharacterIds,
      }),
    )
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const activeId = encounter?.active_combatant_id;
  const activeCombatant = combatants.find((c) => c.id === activeId);
  const isMyTurn = Boolean(activeCombatant?.character_id && myCharacterIds.includes(activeCombatant.character_id));

  // 내 차례가 되면 알림을 띄운다(소리 알림에는 시각적 대안이 함께 제공된다).
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMyTurn && activeId && notifiedRef.current !== activeId) {
      notifiedRef.current = activeId;
      toast.info('내 차례입니다!');
    }
    if (!isMyTurn) notifiedRef.current = null;
  }, [isMyTurn, activeId]);

  if (!encounter || encounter.status !== 'active') {
    return (
      <section aria-label="이니셔티브" className="rounded-xl border border-[var(--color-border)] p-4 text-sm text-[var(--color-fg-muted)]">
        진행 중인 전투가 없습니다.
      </section>
    );
  }

  return (
    <section aria-label="이니셔티브" className="flex flex-col gap-2">
      {isMyTurn ? (
        <p
          role="status"
          data-testid="my-turn-banner"
          className="rounded-xl border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/15 px-4 py-3 text-center text-lg font-bold text-[var(--color-accent)]"
        >
          내 차례입니다!
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          <Swords aria-hidden className="h-4 w-4" />
          이니셔티브
        </h2>
        <span data-testid="player-round">
          <Badge tone="accent">라운드 {encounter.round}</Badge>
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {visible.map((combatant) => {
          const active = combatant.id === activeId;
          return (
            <li
              key={combatant.id}
              data-testid={`initiative-${combatant.name}`}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-2',
                active ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-[var(--color-border)]',
                combatant.is_defeated && 'opacity-60',
              )}
            >
              <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold">{combatant.initiative ?? '—'}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {combatant.name}
                  {combatant.is_concentrating ? <Sparkles aria-label="집중 중" className="h-3.5 w-3.5 text-[var(--color-accent)]" /> : null}
                  {active ? <Badge tone="accent">현재 차례</Badge> : null}
                </p>
                {combatant.conditions.length > 0 ? (
                  <ul className="mt-0.5 flex flex-wrap gap-1">
                    {combatant.conditions.map((c) => (
                      <li key={c.id}>
                        <ConditionBadge conditionKey={c.key} name={c.name} stacks={c.stacks} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="w-24 shrink-0">
                <HpBar hp={combatant.hp} maxHp={combatant.max_hp} tempHp={combatant.temp_hp} tier={combatant.hp === null ? combatant.hp_tier : undefined} size="sm" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
