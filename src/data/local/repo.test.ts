import { beforeEach, describe, expect, it } from 'vitest';
import { repo } from '@/data';
import { AppError } from '@/data/repository';
import { localStore } from './store';
import sampleCampaign from '../../../docs/sample/sample-campaign.json';

/**
 * 데이터 계층 통합 테스트 (데모 어댑터).
 * 권한 판정과 공개 범위가 저장소 수준에서 강제되는지 확인한다.
 * (운영 환경에서는 동일한 규칙을 Supabase RLS가 강제한다.)
 */

async function signUpDM() {
  localStore.reset();
  await repo().auth.signUp('dm@test.local', 'test-password', '던전 마스터');
  const campaign = await repo().campaigns.create({ name: '테스트 캠페인' });
  return campaign;
}

async function addPlayer(campaignCode: string) {
  const dmId = localStore.getCurrentUserId();
  await repo().auth.signUp('player@test.local', 'test-password', '플레이어');
  const playerId = localStore.getCurrentUserId();
  await repo().campaigns.joinByCode(campaignCode);
  return { dmId, playerId };
}

function loginAs(userId: string | null) {
  localStore.setCurrentUserId(userId);
}

describe('데모 저장소 어댑터', () => {
  beforeEach(() => {
    localStore.reset();
  });

  it('회원가입하면 프로필과 세션이 만들어진다', async () => {
    const state = await repo().auth.signUp('a@test.local', 'test-password', '모험가');
    expect(state.user?.email).toBe('a@test.local');
    expect(state.profile?.display_name).toBe('모험가');
  });

  it('같은 이메일로 두 번 가입할 수 없다', async () => {
    await repo().auth.signUp('a@test.local', 'test-password', '모험가');
    await expect(repo().auth.signUp('a@test.local', 'test-password', '다른 사람')).rejects.toBeInstanceOf(AppError);
  });

  it('짧은 비밀번호를 거부한다', async () => {
    await expect(repo().auth.signUp('b@test.local', 'short', '모험가')).rejects.toThrow(/8자 이상/);
  });

  it('캠페인 생성자는 소유자 권한을 갖는다', async () => {
    const campaign = await signUpDM();
    const membership = await repo().campaigns.myMembership(campaign.id);
    expect(membership?.role).toBe('owner');
    expect(membership?.permissions.manage_campaign).toBe(true);
  });

  it('참여 코드로 플레이어가 참여한다', async () => {
    const campaign = await signUpDM();
    const { playerId } = await addPlayer(campaign.join_code);
    const membership = await repo().campaigns.myMembership(campaign.id);
    expect(membership?.user_id).toBe(playerId);
    expect(membership?.role).toBe('player');
  });

  it('잘못된 참여 코드는 오류를 낸다', async () => {
    await signUpDM();
    await expect(repo().campaigns.joinByCode('ZZZZZZ')).rejects.toThrow(/참여 코드를 찾을 수 없습니다/);
  });

  describe('카드 공개 범위', () => {
    it('플레이어는 비공개 카드를 볼 수 없고, 보관함에도 접근할 수 없다', async () => {
      const campaign = await signUpDM();
      const card = await repo().library.createCard(campaign.id, { type: 'monster', name: '비밀 몬스터', dm_notes: '약점은 화염' });
      const { dmId, playerId } = await addPlayer(campaign.join_code);

      loginAs(playerId);
      await expect(repo().library.cards(campaign.id)).rejects.toThrow(/권한이 없습니다/);
      expect(await repo().library.visibleCards(campaign.id)).toHaveLength(0);

      loginAs(dmId);
      await repo().library.setReveal(card.id, { scope: 'name_only' });

      loginAs(playerId);
      const visible = await repo().library.visibleCards(campaign.id);
      expect(visible).toHaveLength(1);
      expect(visible[0]?.name).toBe('비밀 몬스터');
      expect(visible[0]?.summary).toBeNull();
      expect(JSON.stringify(visible)).not.toContain('약점은 화염');
    });

    it('플레이어는 카드를 수정하거나 공개 범위를 바꿀 수 없다', async () => {
      const campaign = await signUpDM();
      const card = await repo().library.createCard(campaign.id, { type: 'npc', name: '촌장' });
      const { playerId } = await addPlayer(campaign.join_code);

      loginAs(playerId);
      await expect(repo().library.updateCard(card.id, { name: '해킹됨' })).rejects.toThrow(/권한이 없습니다/);
      await expect(repo().library.setReveal(card.id, { scope: 'full' })).rejects.toThrow(/권한이 없습니다/);
    });

    it('일시 공개는 세션이 끝나면 원래 상태로 돌아간다', async () => {
      const campaign = await signUpDM();
      const card = await repo().library.createCard(campaign.id, { type: 'handout', name: '지도' });
      const session = await repo().sessions.create(campaign.id, { title: '1회차' });
      await repo().sessions.start(session.id);

      await repo().library.setReveal(card.id, { scope: 'full', temporary: true, sessionId: session.id });
      expect((await repo().library.card(card.id)).reveal_scope).toBe('full');

      await repo().sessions.end(session.id);
      expect((await repo().library.card(card.id)).reveal_scope).toBe('hidden');
    });
  });

  describe('전투', () => {
    it('피해를 적용하면 임시 HP부터 차감하고 로그를 남긴다', async () => {
      const campaign = await signUpDM();
      const session = await repo().sessions.create(campaign.id, { title: '전투 세션' });
      await repo().sessions.start(session.id);
      const encounter = await repo().combat.createEncounter(session.id, '첫 전투');
      const [combatant] = await repo().combat.addCombatant(encounter.id, {
        source_type: 'monster',
        name: '고블린',
        hp: 12,
        max_hp: 12,
        ac: 13,
      });
      expect(combatant).toBeDefined();
      if (!combatant) return;

      await repo().combat.applyHp(encounter.id, [{ combatantId: combatant.id, amount: 5, kind: 'temp' }]);
      await repo().combat.applyHp(encounter.id, [{ combatantId: combatant.id, amount: 8, kind: 'damage' }]);

      const [updated] = await repo().combat.combatants(encounter.id);
      expect(updated?.temp_hp).toBe(0);
      expect(updated?.hp).toBe(9);

      const logs = await repo().sessions.logs(session.id);
      expect(logs.some((log) => log.event_type === 'combat.hp')).toBe(true);
    });

    it('같은 몬스터를 여러 개 추가하면 이름이 구분된다', async () => {
      const campaign = await signUpDM();
      const session = await repo().sessions.create(campaign.id, { title: '전투 세션' });
      const encounter = await repo().combat.createEncounter(session.id, '전투');
      await repo().combat.addCombatant(encounter.id, { source_type: 'monster', name: '고블린', hp: 7, max_hp: 7, ac: 13, count: 3 });

      const names = (await repo().combat.combatants(encounter.id)).map((c) => c.name);
      expect(new Set(names).size).toBe(3);
      expect(names.every((name) => name.startsWith('고블린'))).toBe(true);
    });

    it('마지막 참가자의 턴이 끝나면 라운드가 증가한다', async () => {
      const campaign = await signUpDM();
      const session = await repo().sessions.create(campaign.id, { title: '전투 세션' });
      const encounter = await repo().combat.createEncounter(session.id, '전투');
      const [a] = await repo().combat.addCombatant(encounter.id, { source_type: 'monster', name: 'A', hp: 5, max_hp: 5, ac: 10, initiative: 20 });
      const [b] = await repo().combat.addCombatant(encounter.id, { source_type: 'monster', name: 'B', hp: 5, max_hp: 5, ac: 10, initiative: 10 });
      expect(a && b).toBeTruthy();

      const started = await repo().combat.updateEncounter(encounter.id, { status: 'active' });
      expect(started.round).toBe(1);
      expect(started.active_combatant_id).toBe(a?.id);

      const afterFirst = await repo().combat.nextTurn(encounter.id);
      expect(afterFirst.round).toBe(1);
      expect(afterFirst.active_combatant_id).toBe(b?.id);

      const afterSecond = await repo().combat.nextTurn(encounter.id);
      expect(afterSecond.round).toBe(2);
      expect(afterSecond.active_combatant_id).toBe(a?.id);
    });

    it('플레이어는 전투를 조작할 수 없다', async () => {
      const campaign = await signUpDM();
      const session = await repo().sessions.create(campaign.id, { title: '전투 세션' });
      const encounter = await repo().combat.createEncounter(session.id, '전투');
      const { playerId } = await addPlayer(campaign.join_code);

      loginAs(playerId);
      await expect(repo().combat.nextTurn(encounter.id)).rejects.toThrow(/권한이 없습니다/);
      await expect(
        repo().combat.addCombatant(encounter.id, { source_type: 'monster', name: '난입', hp: 1, max_hp: 1, ac: 1 }),
      ).rejects.toThrow(/권한이 없습니다/);
    });
  });

  describe('낙관적 잠금', () => {
    it('버전이 다르면 충돌 오류를 낸다', async () => {
      const campaign = await signUpDM();
      const card = await repo().library.createCard(campaign.id, { type: 'text', name: '메모' });
      await repo().library.updateCard(card.id, { name: '수정본' }, card.version);
      await expect(repo().library.updateCard(card.id, { name: '뒤늦은 수정' }, card.version)).rejects.toThrow(/먼저 내용을 수정/);
    });
  });

  describe('주사위', () => {
    it('굴림 결과를 기록하고 공개 범위를 지킨다', async () => {
      const campaign = await signUpDM();
      const session = await repo().sessions.create(campaign.id, { title: '세션' });
      const dmId = localStore.getCurrentUserId();

      await repo().dice.roll({ campaignId: campaign.id, sessionId: session.id, expression: '1d20+3', visibility: 'dm' });
      const { playerId } = await addPlayer(campaign.join_code);

      loginAs(playerId);
      expect(await repo().dice.list(session.id)).toHaveLength(0);

      loginAs(dmId);
      const rolls = await repo().dice.list(session.id);
      expect(rolls).toHaveLength(1);
      expect(rolls[0]?.total).toBeGreaterThanOrEqual(4);
      expect(rolls[0]?.total).toBeLessThanOrEqual(23);
    });
  });

  describe('내보내기와 가져오기', () => {
    it('내보낸 데이터를 다시 가져올 수 있다', async () => {
      const campaign = await signUpDM();
      await repo().library.createCard(campaign.id, { type: 'monster', name: '드래곤' });
      const exported = await repo().campaigns.exportData(campaign.id);
      expect(exported.cards).toHaveLength(1);

      const preview = await repo().campaigns.previewImport(exported);
      expect(preview.cards).toBe(1);
      expect(preview.conflicts).toHaveLength(1);

      await repo().campaigns.importData(campaign.id, exported, 'duplicate');
      const cards = await repo().library.cards(campaign.id);
      expect(cards).toHaveLength(2);
      // 가져온 카드는 항상 비공개 상태여야 한다.
      expect(cards.every((card) => card.reveal_scope === 'hidden')).toBe(true);
    });

    it('형식이 맞지 않는 파일을 거부한다', async () => {
      await signUpDM();
      await expect(repo().campaigns.previewImport({ nope: true })).rejects.toThrow(/가져올 수 없는 파일 형식/);
    });

    it('제공된 샘플 캠페인을 그대로 가져올 수 있다', async () => {
      await signUpDM();

      const preview = await repo().campaigns.previewImport(sampleCampaign);
      expect(preview.campaignName).toBe('잊혀진 등대의 서약');
      expect(preview.cards).toBe(8);
      expect(preview.folders).toBe(4);
      expect(preview.tags).toBe(4);

      const campaign = await repo().campaigns.importData(null, sampleCampaign, 'skip');
      const cards = await repo().library.cards(campaign.id);
      const folders = await repo().library.folders(campaign.id);
      const tags = await repo().library.tags(campaign.id);

      expect(cards).toHaveLength(8);
      expect(folders).toHaveLength(4);
      expect(tags).toHaveLength(4);
      // 폴더 계층이 유지된다.
      const parent = folders.find((f) => f.name === '몬스터');
      const child = folders.find((f) => f.name === '등대 내부');
      expect(child?.parent_id).toBe(parent?.id);
      // 몬스터 스탯과 섹션이 함께 들어온다.
      const boss = cards.find((c) => c.name === '등대지기 헤르몬드');
      expect(boss?.stats?.cr).toBe('6');
      expect(boss?.sections?.length).toBe(7);
      // 가져온 카드는 예외 없이 비공개다.
      expect(cards.every((card) => card.reveal_scope === 'hidden')).toBe(true);
    });
  });
});
