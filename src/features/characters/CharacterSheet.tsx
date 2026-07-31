import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, Coffee, Heart, Plus, Trash2 } from 'lucide-react';
import { repo } from '@/data';
import { qk } from '@/hooks/queries';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { HpBar } from '@/components/ui/HpBar';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { useAutosave, SAVE_STATUS_LABELS } from '@/hooks/useAutosave';
import { ABILITY_KEYS, ABILITY_LABELS, type CharacterResource, type PlayerCharacter } from '@/data/types';
import { abilityModifier, formatModifier, proficiencyBonusForLevel, SKILL_LIST } from '@/domain/abilities';
import { applyDamage, applyHealing, setTempHp } from '@/domain/hp';
import { ImageUpload } from '@/features/library/ImageUpload';
const InlineRichText = lazy(() => import('@/features/editor/InlineRichText').then((m) => ({ default: m.InlineRichText })));
import { cn } from '@/lib/cn';

/** 플레이어 캐릭터 시트 */
export function CharacterSheet({ character, campaignId, onClose }: { character: PlayerCharacter; campaignId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [state, setState] = useState<PlayerCharacter>(character);
  const [tab, setTab] = useState<'core' | 'abilities' | 'resources' | 'detail'>('core');
  const [version, setVersion] = useState(character.version);
  const [hpInput, setHpInput] = useState('');

  const { data: resources = [] } = useQuery({
    queryKey: qk.resources(character.id),
    queryFn: () => repo().characters.resources(character.id),
  });

  const { status } = useAutosave<PlayerCharacter>({
    draftKey: `character:${character.id}`,
    value: state,
    onSave: async (value) => {
      const saved = await repo().characters.update(
        character.id,
        {
          name: value.name,
          player_name: value.player_name,
          klass: value.klass,
          subclass: value.subclass,
          level: value.level,
          race: value.race,
          background: value.background,
          alignment: value.alignment,
          xp: value.xp,
          image_url: value.image_url,
          description: value.description,
          ac: value.ac,
          hp: value.hp,
          max_hp: value.max_hp,
          temp_hp: value.temp_hp,
          speed: value.speed,
          proficiency_bonus: value.proficiency_bonus,
          initiative_bonus: value.initiative_bonus,
          passive_perception: value.passive_perception,
          inspiration: value.inspiration,
          abilities: value.abilities,
          saves: value.saves,
          skills: value.skills,
          death_saves: value.death_saves,
          sheet: value.sheet,
          share_settings: value.share_settings,
        },
        version,
      );
      setVersion(saved.version);
      void client.invalidateQueries({ queryKey: qk.characters(campaignId) });
    },
  });

  // 레벨을 바꾸면 숙련 보너스를 자동으로 맞춘다.
  useEffect(() => {
    const expected = proficiencyBonusForLevel(state.level);
    if (state.proficiency_bonus !== expected) {
      setState((prev) => ({ ...prev, proficiency_bonus: expected }));
    }
  }, [state.level, state.proficiency_bonus]);

  const set = <K extends keyof PlayerCharacter>(key: K, value: PlayerCharacter[K]) => setState((prev) => ({ ...prev, [key]: value }));

  const applyHp = (kind: 'damage' | 'heal' | 'temp') => {
    const amount = Number(hpInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.warning('적용할 숫자를 입력해 주세요.');
      return;
    }
    const hpState = { hp: state.hp, maxHp: state.max_hp, tempHp: state.temp_hp };
    const next =
      kind === 'damage' ? applyDamage(hpState, amount) : kind === 'heal' ? applyHealing(hpState, amount) : setTempHp(hpState, amount);
    setState((prev) => ({ ...prev, hp: next.hp, temp_hp: next.tempHp }));
    setHpInput('');
  };

  const rest = async (kind: 'short' | 'long') => {
    try {
      await repo().characters.rest(character.id, kind);
      const refreshed = await repo().characters.get(character.id);
      setState(refreshed);
      setVersion(refreshed.version);
      void client.invalidateQueries({ queryKey: qk.resources(character.id) });
      toast.success(kind === 'long' ? '긴 휴식을 마쳤습니다.' : '짧은 휴식을 마쳤습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={state.name || '캐릭터 시트'}
      size="xl"
      disableBackdropClose
      footer={
        <>
          <span role="status" aria-live="polite" className="mr-auto text-xs text-[var(--color-fg-muted)]">
            {SAVE_STATUS_LABELS[status]}
          </span>
          <Button variant="secondary" onClick={() => void rest('short')}>
            <Coffee aria-hidden className="h-4 w-4" />
            짧은 휴식
          </Button>
          <Button variant="secondary" onClick={() => void rest('long')}>
            <BedDouble aria-hidden className="h-4 w-4" />긴 휴식
          </Button>
          <Button variant="primary" onClick={onClose}>
            닫기
          </Button>
        </>
      }
    >
      <div role="tablist" aria-label="캐릭터 시트 탭" className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {(
          [
            ['core', '핵심'],
            ['abilities', '능력치'],
            ['resources', '자원'],
            ['detail', '상세'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === key ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-fg-muted)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'core' ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="캐릭터 이름" required>
              {({ id }) => <Input id={id} value={state.name} onChange={(e) => set('name', e.target.value)} />}
            </Field>
            <Field label="플레이어 이름">
              {({ id }) => <Input id={id} value={state.player_name} onChange={(e) => set('player_name', e.target.value)} />}
            </Field>
            <Field label="클래스">{({ id }) => <Input id={id} value={state.klass} onChange={(e) => set('klass', e.target.value)} />}</Field>
            <Field label="서브클래스">{({ id }) => <Input id={id} value={state.subclass} onChange={(e) => set('subclass', e.target.value)} />}</Field>
            <Field label="종족">{({ id }) => <Input id={id} value={state.race} onChange={(e) => set('race', e.target.value)} />}</Field>
            <Field label="배경">{({ id }) => <Input id={id} value={state.background} onChange={(e) => set('background', e.target.value)} />}</Field>
            <Field label="레벨" hint={`숙련 보너스 ${formatModifier(state.proficiency_bonus)}`}>
              {({ id }) => <Input id={id} type="number" min={1} max={20} value={state.level} onChange={(e) => set('level', Number(e.target.value))} />}
            </Field>
            <Field label="경험치">{({ id }) => <Input id={id} type="number" min={0} value={state.xp} onChange={(e) => set('xp', Number(e.target.value))} />}</Field>
          </div>

          <section className="rounded-xl border border-[var(--color-border)] p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Heart aria-hidden className="h-4 w-4 text-[var(--color-danger)]" />
              생명력
            </h3>
            <HpBar hp={state.hp} maxHp={state.max_hp} tempHp={state.temp_hp} />
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Field label="현재 HP">
                {({ id }) => <Input id={id} type="number" value={state.hp} onChange={(e) => set('hp', Math.max(0, Math.min(state.max_hp, Number(e.target.value))))} />}
              </Field>
              <Field label="최대 HP">
                {({ id }) => <Input id={id} type="number" min={1} value={state.max_hp} onChange={(e) => set('max_hp', Number(e.target.value))} />}
              </Field>
              <Field label="임시 HP">
                {({ id }) => <Input id={id} type="number" min={0} value={state.temp_hp} onChange={(e) => set('temp_hp', Number(e.target.value))} />}
              </Field>
              <Field label="방어도">{({ id }) => <Input id={id} type="number" value={state.ac} onChange={(e) => set('ac', Number(e.target.value))} />}</Field>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="빠른 적용" className="w-32">
                {({ id }) => (
                  <Input id={id} type="number" min={0} value={hpInput} onChange={(e) => setHpInput(e.target.value)} placeholder="숫자" />
                )}
              </Field>
              <Button variant="danger" onClick={() => applyHp('damage')}>
                피해
              </Button>
              <Button variant="secondary" onClick={() => applyHp('heal')}>
                회복
              </Button>
              <Button variant="secondary" onClick={() => applyHp('temp')}>
                임시 HP
              </Button>
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium">죽음 내성 굴림</legend>
              <div className="mt-2 flex gap-6">
                {(['successes', 'failures'] as const).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-sm text-[var(--color-fg-muted)]">{key === 'successes' ? '성공' : '실패'}</span>
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${key === 'successes' ? '성공' : '실패'} ${n}`}
                        aria-pressed={state.death_saves[key] >= n}
                        onClick={() => set('death_saves', { ...state.death_saves, [key]: state.death_saves[key] >= n ? n - 1 : n })}
                        className={cn(
                          'h-6 w-6 rounded-full border-2',
                          state.death_saves[key] >= n
                            ? key === 'successes'
                              ? 'border-[var(--color-success)] bg-[var(--color-success)]'
                              : 'border-[var(--color-danger)] bg-[var(--color-danger)]'
                            : 'border-[var(--color-border)]',
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="이동 속도">{({ id }) => <Input id={id} type="number" value={state.speed} onChange={(e) => set('speed', Number(e.target.value))} />}</Field>
            <Field label="이니셔티브 보너스" hint={`민첩 수정치 ${formatModifier(abilityModifier(state.abilities.dex))} 포함`}>
              {({ id }) => <Input id={id} type="number" value={state.initiative_bonus} onChange={(e) => set('initiative_bonus', Number(e.target.value))} />}
            </Field>
            <Field label="수동 지각">
              {({ id }) => <Input id={id} type="number" value={state.passive_perception} onChange={(e) => set('passive_perception', Number(e.target.value))} />}
            </Field>
          </div>

          <Checkbox label="영감 보유" checked={state.inspiration} onChange={(e) => set('inspiration', e.target.checked)} />

          <ImageUpload campaignId={campaignId} value={state.image_url} onChange={(url) => set('image_url', url)} label="캐릭터 이미지" />
        </div>
      ) : null}

      {tab === 'abilities' ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {ABILITY_KEYS.map((key) => (
              <div key={key} className="rounded-lg border border-[var(--color-border)] p-2 text-center">
                <label htmlFor={`char-ability-${key}`} className="block text-xs font-medium text-[var(--color-fg-muted)]">
                  {ABILITY_LABELS[key]}
                </label>
                <input
                  id={`char-ability-${key}`}
                  type="number"
                  min={1}
                  max={30}
                  value={state.abilities[key]}
                  onChange={(e) => set('abilities', { ...state.abilities, [key]: Number(e.target.value) })}
                  className="w-full bg-transparent text-center text-xl font-semibold focus:outline-none"
                />
                <span className="text-xs text-[var(--color-fg-muted)]">{formatModifier(abilityModifier(state.abilities[key]))}</span>
              </div>
            ))}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">내성 굴림 숙련</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ABILITY_KEYS.map((key) => {
                const bonus = abilityModifier(state.abilities[key]) + (state.saves[key] ? state.proficiency_bonus : 0);
                return (
                  <Checkbox
                    key={key}
                    label={`${ABILITY_LABELS[key]} ${formatModifier(bonus)}`}
                    checked={state.saves[key] === true}
                    onChange={(e) => set('saves', { ...state.saves, [key]: e.target.checked })}
                  />
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">기술 숙련</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SKILL_LIST.map((skill) => {
                const bonus = abilityModifier(state.abilities[skill.ability]) + (state.skills[skill.key] ? state.proficiency_bonus : 0);
                return (
                  <Checkbox
                    key={skill.key}
                    label={`${skill.label} ${formatModifier(bonus)}`}
                    checked={state.skills[skill.key] === true}
                    onChange={(e) => set('skills', { ...state.skills, [skill.key]: e.target.checked })}
                  />
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}

      {tab === 'resources' ? <ResourcesTab characterId={character.id} resources={resources} state={state} onChange={setState} /> : null}

      {tab === 'detail' ? (
        <div className="flex flex-col gap-4">
          {(
            [
              ['attacks', '공격'],
              ['spells', '주문'],
              ['equipment', '장비'],
              ['inventory', '인벤토리'],
              ['features', '특징과 특성'],
              ['proficiencies', '숙련'],
              ['languages', '언어'],
              ['notes', '개인 메모'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              {() => (
                <Suspense fallback={<div className="rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-fg-muted)]">편집기를 불러오는 중…</div>}>
                  <InlineRichText
                    ariaLabel={label}
                    value={state.sheet[key]}
                    onChange={(html) => set('sheet', { ...state.sheet, [key]: html })}
                  />
                </Suspense>
              )}
            </Field>
          ))}

          <fieldset className="rounded-lg border border-[var(--color-border)] p-3">
            <legend className="px-1 text-sm font-medium">파티에게 공개할 정보</legend>
            <Checkbox
              label="정확한 HP 수치"
              checked={state.share_settings.show_hp_numbers}
              onChange={(e) => set('share_settings', { ...state.share_settings, show_hp_numbers: e.target.checked })}
            />
            <Checkbox
              label="방어도"
              checked={state.share_settings.show_ac}
              onChange={(e) => set('share_settings', { ...state.share_settings, show_ac: e.target.checked })}
            />
            <Checkbox
              label="상태 효과"
              checked={state.share_settings.show_conditions}
              onChange={(e) => set('share_settings', { ...state.share_settings, show_conditions: e.target.checked })}
            />
          </fieldset>
        </div>
      ) : null}
    </Dialog>
  );
}

function ResourcesTab({
  characterId,
  resources,
  state,
  onChange,
}: {
  characterId: string;
  resources: CharacterResource[];
  state: PlayerCharacter;
  onChange: (next: PlayerCharacter) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [max, setMax] = useState(1);
  const [recharge, setRecharge] = useState<CharacterResource['recharge']>('long');

  const refresh = () => void client.invalidateQueries({ queryKey: qk.resources(characterId) });

  const add = async () => {
    if (!name.trim()) return;
    await repo().characters.saveResource(characterId, { name: name.trim(), current: max, max, recharge });
    setName('');
    refresh();
  };

  const adjust = async (resource: CharacterResource, delta: number) => {
    const next = Math.max(0, Math.min(resource.max, resource.current + delta));
    await repo().characters.saveResource(characterId, { ...resource, current: next });
    refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 font-semibold">주문 슬롯</h3>
        <div className="flex flex-col gap-2">
          {state.sheet.spell_slots.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">아직 주문 슬롯이 없습니다.</p>
          ) : null}
          {state.sheet.spell_slots.map((slot, index) => (
            <div key={slot.level} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2">
              <span className="w-16 text-sm font-medium">{slot.level}레벨</span>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: slot.max }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${slot.level}레벨 슬롯 ${i + 1}`}
                    aria-pressed={i < slot.current}
                    onClick={() => {
                      const slots = [...state.sheet.spell_slots];
                      slots[index] = { ...slot, current: i < slot.current ? i : i + 1 };
                      onChange({ ...state, sheet: { ...state.sheet, spell_slots: slots } });
                    }}
                    className={cn('h-6 w-6 rounded border-2', i < slot.current ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-[var(--color-border)]')}
                  />
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                aria-label={`${slot.level}레벨 슬롯 삭제`}
                onClick={() =>
                  onChange({ ...state, sheet: { ...state.sheet, spell_slots: state.sheet.spell_slots.filter((s) => s.level !== slot.level) } })
                }
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => {
              const nextLevel = state.sheet.spell_slots.length + 1;
              if (nextLevel > 9) return;
              onChange({
                ...state,
                sheet: { ...state.sheet, spell_slots: [...state.sheet.spell_slots, { level: nextLevel, current: 2, max: 2 }] },
              });
            }}
          >
            <Plus aria-hidden className="h-4 w-4" />
            슬롯 레벨 추가
          </Button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">클래스 자원</h3>
        <ul className="flex flex-col gap-2">
          {resources.map((resource) => (
            <li key={resource.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
              <span className="font-medium">{resource.name}</span>
              <span className="text-sm text-[var(--color-fg-muted)]">
                {resource.current} / {resource.max}
              </span>
              <span className="text-xs text-[var(--color-fg-muted)]">
                {resource.recharge === 'short' ? '짧은 휴식 회복' : resource.recharge === 'long' ? '긴 휴식 회복' : '수동 회복'}
              </span>
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="secondary" aria-label={`${resource.name} 사용`} onClick={() => void adjust(resource, -1)}>
                  −
                </Button>
                <Button size="sm" variant="secondary" aria-label={`${resource.name} 회복`} onClick={() => void adjust(resource, 1)}>
                  +
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${resource.name} 삭제`}
                  onClick={async () => {
                    await repo().characters.deleteResource(resource.id);
                    refresh();
                  }}
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="자원 이름" className="min-w-40 flex-1">
            {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 기공 점수" />}
          </Field>
          <Field label="최대" className="w-24">
            {({ id }) => <Input id={id} type="number" min={1} value={max} onChange={(e) => setMax(Number(e.target.value))} />}
          </Field>
          <Field label="회복" className="w-36">
            {({ id }) => (
              <Select id={id} value={recharge} onChange={(e) => setRecharge(e.target.value as CharacterResource['recharge'])}>
                <option value="short">짧은 휴식</option>
                <option value="long">긴 휴식</option>
                <option value="none">수동</option>
              </Select>
            )}
          </Field>
          <Button variant="secondary" className="h-10" onClick={add}>
            <Plus aria-hidden className="h-4 w-4" />
            추가
          </Button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">소지금</h3>
        <div className="grid grid-cols-5 gap-2">
          {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => (
            <Field key={coin} label={coin.toUpperCase()}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={state.sheet.currency[coin]}
                  onChange={(e) =>
                    onChange({ ...state, sheet: { ...state.sheet, currency: { ...state.sheet.currency, [coin]: Number(e.target.value) } } })
                  }
                />
              )}
            </Field>
          ))}
        </div>
      </section>
    </div>
  );
}
