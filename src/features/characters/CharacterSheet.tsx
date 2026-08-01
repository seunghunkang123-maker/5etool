import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  PROFICIENCY_LABELS,
  PROFICIENCY_LEVELS,
  type CharacterResource,
  type PlayerCharacter,
  type ProficiencyEntry,
  type ProficiencyLevel,
  type StoredProficiency,
} from '@/data/types';
import { proficiencyTotal, toProficiency, withProficiency } from '@/domain/proficiency';
import { abilityModifier, formatModifier, proficiencyBonusForLevel, SKILL_LIST } from '@/domain/abilities';
import { applyDamage, applyHealing, setTempHp } from '@/domain/hp';
import { ImageUpload } from '@/features/library/ImageUpload';
const InlineRichText = lazy(() => import('@/features/editor/InlineRichText').then((m) => ({ default: m.InlineRichText })));
import { cn } from '@/lib/cn';

/** 한 주문 레벨이 가질 수 있는 슬롯 칸 수 상한. */
const MAX_SPELL_SLOTS_PER_LEVEL = 12;

/**
 * 내성·기술 한 줄.
 * 숙련 정도(없음·절반·숙련·전문성)와 고정 보정치를 고르고 최종 수정치를 보여 준다.
 */
function ProficiencyRow({
  label,
  hint,
  abilityMod,
  proficiencyBonus,
  stored,
  onChange,
}: {
  label: string;
  hint?: string;
  abilityMod: number;
  proficiencyBonus: number;
  stored: StoredProficiency;
  onChange: (entry: ProficiencyEntry) => void;
}) {
  const entry = toProficiency(stored);
  const total = proficiencyTotal(abilityMod, proficiencyBonus, stored);
  const selectId = `prof-level-${label}`;
  const bonusId = `prof-bonus-${label}`;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        {hint ? <span className="block text-[10px] text-[var(--color-fg-muted)]">{hint}</span> : null}
      </span>

      <span className="w-10 shrink-0 text-right font-mono text-sm font-semibold tabular-nums" aria-label={`${label} 최종 수정치`}>
        {formatModifier(total)}
      </span>

      <label className="sr-only" htmlFor={selectId}>
        {label} 숙련
      </label>
      <Select
        id={selectId}
        value={entry.level}
        onChange={(e) => onChange({ ...entry, level: e.target.value as ProficiencyLevel })}
        className="w-28 shrink-0 px-2 py-1 text-xs"
      >
        {PROFICIENCY_LEVELS.map((level) => (
          <option key={level} value={level}>
            {PROFICIENCY_LABELS[level]}
          </option>
        ))}
      </Select>

      <label className="sr-only" htmlFor={bonusId}>
        {label} 추가 보정
      </label>
      <Input
        id={bonusId}
        type="number"
        value={entry.bonus}
        onChange={(e) => onChange({ ...entry, bonus: Math.trunc(Number(e.target.value)) || 0 })}
        className="w-14 shrink-0 px-1.5 py-1 text-center text-xs"
        title="추가 보정"
      />
    </div>
  );
}

/** 플레이어 캐릭터 시트 */
export function CharacterSheet({ character, campaignId, onClose }: { character: PlayerCharacter; campaignId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [state, setState] = useState<PlayerCharacter>(character);
  const [tab, setTab] = useState<'core' | 'abilities' | 'resources' | 'detail'>('core');
  // 버전은 참조로 들고 있는다. 상태로 두면 저장 응답이 늦을 때 옛 버전을 보내
  // 낙관적 잠금에 잘못 걸려 "다른 사용자가 먼저 내용을 수정했습니다"가 뜬다.
  const versionRef = useRef(character.version);
  const [hpInput, setHpInput] = useState('');

  const { data: resources = [] } = useQuery({
    queryKey: qk.resources(character.id),
    queryFn: () => repo().characters.resources(character.id),
  });

  const { status, error: saveError } = useAutosave<PlayerCharacter>({
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
        versionRef.current,
      );
      versionRef.current = saved.version;
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
      versionRef.current = refreshed.version;
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
          {/* 실패했으면 이유까지 보여 준다. "저장 실패"만 뜨면 할 수 있는 일이 없다. */}
          <span
            role="status"
            aria-live="polite"
            className={cn(
              'mr-auto min-w-0 truncate text-xs',
              status === 'error' || status === 'offline' ? 'text-[var(--color-danger)]' : 'text-[var(--color-fg-muted)]',
            )}
            title={saveError ?? undefined}
          >
            {(status === 'error' || status === 'offline') && saveError
              ? `${SAVE_STATUS_LABELS[status]} — ${saveError}`
              : SAVE_STATUS_LABELS[status]}
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
            <legend className="mb-1 text-sm font-medium">내성 굴림</legend>
            <p className="mb-2 text-xs text-[var(--color-fg-muted)]">
              숙련 정도를 고르고, 마법 물품처럼 따로 붙는 값은 보정 칸에 적습니다.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ABILITY_KEYS.map((key) => (
                <ProficiencyRow
                  key={key}
                  label={ABILITY_LABELS[key]}
                  abilityMod={abilityModifier(state.abilities[key])}
                  proficiencyBonus={state.proficiency_bonus}
                  stored={state.saves[key]}
                  onChange={(entry) => set('saves', withProficiency(state.saves, key, entry))}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">기술</legend>
            <p className="mb-2 text-xs text-[var(--color-fg-muted)]">
              전문성은 숙련 보너스의 2배, 재주꾼은 절반(내림)이 붙습니다.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {SKILL_LIST.map((skill) => (
                <ProficiencyRow
                  key={skill.key}
                  label={skill.label}
                  hint={ABILITY_LABELS[skill.ability]}
                  abilityMod={abilityModifier(state.abilities[skill.ability])}
                  proficiencyBonus={state.proficiency_bonus}
                  stored={state.skills[skill.key]}
                  onChange={(entry) => set('skills', withProficiency(state.skills, skill.key, entry) as Record<string, StoredProficiency>)}
                />
              ))}
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
  // 아직 없는 가장 낮은 주문 레벨. 1~9 중 빠진 번호를 채운다.
  const nextSlotLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((level) => !state.sheet.spell_slots.some((s) => s.level === level)) ?? 10;
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
          {state.sheet.spell_slots.map((slot, index) => {
            /** 칸 수를 바꾼다. 남은 칸이 최대치를 넘지 않게 함께 맞춘다. */
            const setMax = (raw: number) => {
              const max = Math.min(MAX_SPELL_SLOTS_PER_LEVEL, Math.max(0, Math.trunc(raw) || 0));
              const slots = [...state.sheet.spell_slots];
              slots[index] = { ...slot, max, current: Math.min(slot.current, max) };
              onChange({ ...state, sheet: { ...state.sheet, spell_slots: slots } });
            };

            return (
              <div key={slot.level} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2">
                <span className="w-16 text-sm font-medium">{slot.level}레벨</span>

                {/* 슬롯 칸 수는 레벨과 클래스마다 다르므로 직접 정한다. */}
                <div className="flex items-center gap-1">
                  <label className="sr-only" htmlFor={`slot-max-${slot.level}`}>
                    {slot.level}레벨 슬롯 개수
                  </label>
                  <Button size="sm" variant="ghost" aria-label={`${slot.level}레벨 슬롯 개수 줄이기`} onClick={() => setMax(slot.max - 1)}>
                    −
                  </Button>
                  <Input
                    id={`slot-max-${slot.level}`}
                    type="number"
                    min={0}
                    max={MAX_SPELL_SLOTS_PER_LEVEL}
                    value={slot.max}
                    onChange={(e) => setMax(Number(e.target.value))}
                    className="w-14 px-1.5 py-1 text-center text-sm"
                  />
                  <Button size="sm" variant="ghost" aria-label={`${slot.level}레벨 슬롯 개수 늘리기`} onClick={() => setMax(slot.max + 1)}>
                    +
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {slot.max === 0 ? <span className="text-xs text-[var(--color-fg-muted)]">칸 없음</span> : null}
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

                <span className="text-xs text-[var(--color-fg-muted)]">
                  {slot.current} / {slot.max}
                </span>

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
            );
          })}
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={nextSlotLevel > 9}
            onClick={() => {
              if (nextSlotLevel > 9) return;
              onChange({
                ...state,
                sheet: {
                  ...state.sheet,
                  // 새 레벨은 빠진 번호부터 채운다. 개수는 바로 위 칸에서 고칠 수 있다.
                  spell_slots: [...state.sheet.spell_slots, { level: nextSlotLevel, current: 2, max: 2 }].sort((a, b) => a.level - b.level),
                },
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
