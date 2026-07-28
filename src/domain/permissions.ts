import type { CampaignMember, CampaignRole, PermissionKey, Permissions, ViewerContext } from '@/data/types';

/**
 * 역할·권한 판정.
 *
 * ⚠️ 이 모듈은 UI 표시를 위한 것이다. 실제 접근 제어는 DB(RLS)와 서버 함수가 강제한다.
 *    프론트엔드에서 버튼을 숨기는 것만으로 권한을 통제하지 않는다.
 */

export const DEFAULT_PERMISSIONS: Record<CampaignRole, Permissions> = {
  owner: {
    view_assets: true,
    edit_assets: true,
    manage_combat: true,
    manage_players: true,
    manage_session: true,
    use_ai: true,
    manage_campaign: true,
  },
  co_dm: {
    view_assets: true,
    edit_assets: true,
    manage_combat: true,
    manage_players: false,
    manage_session: false,
    use_ai: false,
    manage_campaign: false,
  },
  player: {},
  spectator: {},
};

export function can(viewer: ViewerContext | null | undefined, permission: PermissionKey): boolean {
  if (!viewer) return false;
  if (viewer.role === 'owner') return true;
  if (viewer.role === 'player' || viewer.role === 'spectator') return false;
  return viewer.permissions[permission] === true;
}

/** DM 권한(소유자 또는 공동 DM)인가 — 비공개 자료 접근의 기준 */
export function isDM(viewer: ViewerContext | null | undefined): boolean {
  return viewer?.role === 'owner' || viewer?.role === 'co_dm';
}

export function isOwner(viewer: ViewerContext | null | undefined): boolean {
  return viewer?.role === 'owner';
}

export function isPlayer(viewer: ViewerContext | null | undefined): boolean {
  return viewer?.role === 'player';
}

export function isSpectator(viewer: ViewerContext | null | undefined): boolean {
  return viewer?.role === 'spectator';
}

/** 캠페인 자료를 편집할 수 있는가 */
export function canEditAssets(viewer: ViewerContext | null | undefined): boolean {
  return isOwner(viewer) || can(viewer, 'edit_assets');
}

/** 전투를 진행할 수 있는가 */
export function canManageCombat(viewer: ViewerContext | null | undefined): boolean {
  return isOwner(viewer) || can(viewer, 'manage_combat');
}

/** 비공개 자료(DM 메모 포함)를 열람할 수 있는가 */
export function canViewPrivateAssets(viewer: ViewerContext | null | undefined): boolean {
  return isOwner(viewer) || can(viewer, 'view_assets');
}

export function viewerFromMember(member: CampaignMember | null | undefined): ViewerContext | null {
  if (!member) return null;
  return { userId: member.user_id, role: member.role, permissions: member.permissions ?? {} };
}

export const ROLE_LABELS: Record<CampaignRole, string> = {
  owner: '던전 마스터',
  co_dm: '공동 던전 마스터',
  player: '플레이어',
  spectator: '관전자',
};
