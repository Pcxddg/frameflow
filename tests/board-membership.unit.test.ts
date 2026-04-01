import test from 'node:test';
import assert from 'node:assert/strict';

import { getCurrentUserRole, stabilizeBoardMembership } from '../src/lib/boardMembership';

test('stabilizeBoardMembership prefers explicit memberRoles over legacy member ordering', () => {
  const result = stabilizeBoardMembership(
    ['editor@example.com', 'owner@example.com'],
    {
      'owner@example.com': 'owner',
      'editor@example.com': 'editor',
    }
  );

  assert.deepEqual(result.members, ['owner@example.com', 'editor@example.com']);
  assert.deepEqual(result.memberRoles, {
    'owner@example.com': 'owner',
    'editor@example.com': 'editor',
  });
});

test('stabilizeBoardMembership keeps legacy fallback only when roles are absent', () => {
  const result = stabilizeBoardMembership(['OWNER@example.com', 'viewer@example.com']);

  assert.deepEqual(result.members, ['owner@example.com', 'viewer@example.com']);
  assert.equal(result.memberRoles['owner@example.com'], 'owner');
  assert.equal(result.memberRoles['viewer@example.com'], 'editor');
});

test('getCurrentUserRole reads the effective role from normalized memberRoles', () => {
  const role = getCurrentUserRole(
    {
      memberRoles: {
        'owner@example.com': 'owner',
        'viewer@example.com': 'viewer',
      },
    } as any,
    {
      uid: 'user-1',
      email: 'Viewer@Example.com',
      emailLowercase: 'viewer@example.com',
      displayName: 'Viewer',
      photoURL: '',
    }
  );

  assert.equal(role, 'viewer');
});
