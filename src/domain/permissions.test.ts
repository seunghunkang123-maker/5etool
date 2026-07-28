import { describe, expect, it } from 'vitest';
import type { ViewerContext } from '@/data/types';
import { can, canEditAssets, canManageCombat, canViewPrivateAssets, DEFAULT_PERMISSIONS, isDM, isOwner } from './permissions';

const owner: ViewerContext = { userId: 'o', role: 'owner', permissions: {} };
const coDmFull: ViewerContext = { userId: 'c', role: 'co_dm', permissions: DEFAULT_PERMISSIONS.co_dm };
const coDmNone: ViewerContext = { userId: 'c2', role: 'co_dm', permissions: {} };
const player: ViewerContext = { userId: 'p', role: 'player', permissions: {} };
const spectator: ViewerContext = { userId: 's', role: 'spectator', permissions: {} };

describe('can', () => {
  it('소유자는 모든 권한을 가진다', () => {
    expect(can(owner, 'manage_campaign')).toBe(true);
    expect(can(owner, 'use_ai')).toBe(true);
  });

  it('공동 DM은 부여된 권한만 가진다', () => {
    expect(can(coDmFull, 'edit_assets')).toBe(true);
    expect(can(coDmFull, 'manage_players')).toBe(false);
    expect(can(coDmNone, 'edit_assets')).toBe(false);
  });

  it('플레이어와 관전자는 관리 권한이 없다', () => {
    expect(can(player, 'edit_assets')).toBe(false);
    expect(can(spectator, 'view_assets')).toBe(false);
  });

  it('뷰어가 없으면 항상 false다', () => {
    expect(can(null, 'view_assets')).toBe(false);
    expect(can(undefined, 'edit_assets')).toBe(false);
  });

  it('플레이어가 권한 플래그를 위조해도 무시한다', () => {
    const forged: ViewerContext = { userId: 'p', role: 'player', permissions: { manage_campaign: true, edit_assets: true } };
    expect(can(forged, 'manage_campaign')).toBe(false);
    expect(canEditAssets(forged)).toBe(false);
  });
});

describe('역할 판정', () => {
  it('isOwner / isDM을 구분한다', () => {
    expect(isOwner(owner)).toBe(true);
    expect(isOwner(coDmFull)).toBe(false);
    expect(isDM(coDmFull)).toBe(true);
    expect(isDM(player)).toBe(false);
  });

  it('비공개 자료 열람은 view_assets 권한이 필요하다', () => {
    expect(canViewPrivateAssets(owner)).toBe(true);
    expect(canViewPrivateAssets(coDmFull)).toBe(true);
    expect(canViewPrivateAssets(coDmNone)).toBe(false);
    expect(canViewPrivateAssets(player)).toBe(false);
  });

  it('전투 관리 권한을 판정한다', () => {
    expect(canManageCombat(owner)).toBe(true);
    expect(canManageCombat(coDmFull)).toBe(true);
    expect(canManageCombat(player)).toBe(false);
  });
});

describe('DEFAULT_PERMISSIONS', () => {
  it('플레이어와 관전자는 기본 권한이 비어 있다', () => {
    expect(DEFAULT_PERMISSIONS.player).toEqual({});
    expect(DEFAULT_PERMISSIONS.spectator).toEqual({});
  });

  it('공동 DM 기본값은 관리자 권한을 포함하지 않는다', () => {
    expect(DEFAULT_PERMISSIONS.co_dm.manage_campaign).toBe(false);
    expect(DEFAULT_PERMISSIONS.co_dm.manage_players).toBe(false);
  });
});
