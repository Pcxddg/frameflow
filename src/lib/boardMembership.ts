import type { Board, MemberRole, User as AppUser } from '../types';

const ROLE_PRIORITY: Record<MemberRole, number> = {
  owner: 0,
  editor: 1,
  viewer: 2,
};

export function normalizeMemberEmail(email: string) {
  return email.trim().toLowerCase();
}

function isMemberRole(value: unknown): value is MemberRole {
  return value === 'owner' || value === 'editor' || value === 'viewer';
}

export function stabilizeBoardMembership(
  members: string[] = [],
  memberRoles?: Record<string, MemberRole>
) {
  const normalizedMembers = [...new Set(members.map(normalizeMemberEmail).filter(Boolean))];
  const normalizedRoles = new Map<string, MemberRole>();

  Object.entries(memberRoles || {}).forEach(([email, role]) => {
    const normalizedEmail = normalizeMemberEmail(email);
    if (!normalizedEmail || !isMemberRole(role)) return;

    const previousRole = normalizedRoles.get(normalizedEmail);
    if (!previousRole || ROLE_PRIORITY[role] < ROLE_PRIORITY[previousRole]) {
      normalizedRoles.set(normalizedEmail, role);
    }
  });

  // Legacy fallback: if a cached board predates memberRoles, keep it usable locally.
  if (normalizedRoles.size === 0 && normalizedMembers.length > 0) {
    normalizedRoles.set(normalizedMembers[0], 'owner');
    normalizedMembers.slice(1).forEach((email) => normalizedRoles.set(email, 'editor'));
  }

  const canonicalMembers = [...normalizedRoles.keys()].sort((left, right) => {
    const leftRole = normalizedRoles.get(left) || 'viewer';
    const rightRole = normalizedRoles.get(right) || 'viewer';
    return ROLE_PRIORITY[leftRole] - ROLE_PRIORITY[rightRole] || left.localeCompare(right);
  });

  return {
    members: canonicalMembers,
    memberRoles: Object.fromEntries(
      canonicalMembers.map((email) => [email, normalizedRoles.get(email) || 'viewer'])
    ) as Record<string, MemberRole>,
  };
}

export function getCurrentUserRole(board: Pick<Board, 'memberRoles'> | null, user: AppUser | null): MemberRole | null {
  if (!board || !user) return null;
  const normalizedEmail = normalizeMemberEmail(user.emailLowercase || user.email);
  return board.memberRoles?.[normalizedEmail] || null;
}
