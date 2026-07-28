import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { useCards, useCharacters } from '@/hooks/queries';
import type { CombatantInput } from '@/data/repository';
import { abilityModifier } from '@/domain/abilities';

/** 전투 참가자 추가: 저장된 몬스터 · 플레이어 캐릭터 · 즉석 참가자 */
export function AddCombatantDialog({
  campaignId,
  onClose,
  onSubmit,
}: {
  campaignId: string;
  onClose: () => void;
  onSubmit: (input: CombatantInput) => Promise<void>;
}) {
  const [tab, setTab] = useState<'library' | 'party' | 'custom'>('library');
  const { data: cards = [] } = useCards(campaignId, { types: ['monster', 'npc'] });
  const { data: characters = [] } = useCharacters(campaignId);

  const [count, setCount] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customName, setCustomName] = useState('');
  const [customHp, setCustomHp] = useState(10);
  const [customAc, setCustomAc] = useState(12);
  const [customDex, setCustomDex] = useState(10);

  const add = async (input: CombatantInput) => {
    setBusy(true);
    try {
      await onSubmit({ ...input, count, is_hidden: hidden });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="전투 참가자 추가" size="lg">
      <div role="tablist" aria-label="참가자 종류" className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {(
          [
            ['library', '보관함 몬스터'],
            ['party', '플레이어 캐릭터'],
            ['custom', '즉석 참가자'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'border-b-2 border-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent)]'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-[var(--color-fg-muted)]'
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="추가 수량" className="w-28">
          {({ id }) => <Input id={id} type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />}
        </Field>
        <Checkbox label="플레이어에게 숨김" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
      </div>

      {tab === 'library' ? (
        cards.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">보관함에 몬스터나 NPC 카드가 없습니다.</p>
        ) : (
          <ul className="scroll-area flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void add({
                      source_type: card.type === 'npc' ? 'npc' : 'monster',
                      source_card_id: card.id,
                      name: card.name,
                      image_url: card.image_url,
                      hp: card.stats?.hp ?? 10,
                      max_hp: card.stats?.max_hp ?? 10,
                      ac: card.stats?.ac ?? 12,
                      dex_score: card.stats?.abilities.dex ?? 10,
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] p-2.5 text-left hover:bg-[var(--color-surface-2)]"
                >
                  {card.image_url ? (
                    <img src={card.image_url} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
                  ) : (
                    <span aria-hidden className="h-10 w-10 rounded bg-[var(--color-surface-3)]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{card.name}</span>
                    <span className="block text-xs text-[var(--color-fg-muted)]">
                      HP {card.stats?.max_hp ?? '—'} · AC {card.stats?.ac ?? '—'} · CR {card.stats?.cr ?? '—'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'party' ? (
        characters.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">아직 등록된 플레이어 캐릭터가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {characters.map((character) => (
              <li key={character.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void add({
                      source_type: 'pc',
                      character_id: character.id,
                      name: character.name,
                      image_url: character.image_url,
                      hp: character.hp,
                      max_hp: character.max_hp,
                      ac: character.ac,
                      dex_score: character.abilities.dex,
                      hide_hp_numbers: false,
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] p-2.5 text-left hover:bg-[var(--color-surface-2)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{character.name}</span>
                    <span className="block text-xs text-[var(--color-fg-muted)]">
                      {character.klass || '클래스 미정'} {character.level}레벨 · HP {character.max_hp} · AC {character.ac} · 이니셔티브{' '}
                      {abilityModifier(character.abilities.dex) + character.initiative_bonus >= 0 ? '+' : ''}
                      {abilityModifier(character.abilities.dex) + character.initiative_bonus}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === 'custom' ? (
        <div className="flex flex-col gap-3">
          <Field label="이름" required>
            {({ id }) => <Input id={id} value={customName} onChange={(e) => setCustomName(e.target.value)} autoFocus placeholder="예: 성난 군중" />}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="HP">{({ id }) => <Input id={id} type="number" min={1} value={customHp} onChange={(e) => setCustomHp(Number(e.target.value))} />}</Field>
            <Field label="방어도">{({ id }) => <Input id={id} type="number" min={1} value={customAc} onChange={(e) => setCustomAc(Number(e.target.value))} />}</Field>
            <Field label="민첩">{({ id }) => <Input id={id} type="number" min={1} max={30} value={customDex} onChange={(e) => setCustomDex(Number(e.target.value))} />}</Field>
          </div>
          <Button
            variant="primary"
            loading={busy}
            disabled={!customName.trim()}
            onClick={() =>
              void add({
                source_type: 'custom',
                name: customName.trim(),
                hp: customHp,
                max_hp: customHp,
                ac: customAc,
                dex_score: customDex,
              })
            }
          >
            추가
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
