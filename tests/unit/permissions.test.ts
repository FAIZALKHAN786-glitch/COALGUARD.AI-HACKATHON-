import { describe, expect, it } from 'vitest';

import {
  canAccessMine,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  permissionDeniedReason,
  permissionsFor,
  ROLE_LABELS,
} from '@/lib/auth/permissions';
import { ROLES } from '@/types';

describe('role permissions', () => {
  it('labels every role', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it('grants system administrators the administrative permissions', () => {
    expect(hasPermission('system_admin', 'admin.access')).toBe(true);
    expect(hasPermission('system_admin', 'admin.users')).toBe(true);
    expect(hasPermission('system_admin', 'mine.create')).toBe(true);
  });

  it('denies administrative access to a field inspector', () => {
    expect(hasPermission('field_inspector', 'admin.access')).toBe(false);
    expect(hasPermission('field_inspector', 'admin.users')).toBe(false);
    expect(hasPermission('field_inspector', 'audit.view')).toBe(false);
  });

  it('keeps regulatory observers read-only for compliance', () => {
    expect(hasPermission('regulatory_user', 'compliance.view')).toBe(true);
    expect(hasPermission('regulatory_user', 'compliance.export')).toBe(true);
    expect(hasPermission('regulatory_user', 'compliance.create')).toBe(false);
    expect(hasPermission('regulatory_user', 'compliance.verify')).toBe(false);
  });

  it('never lets a field inspector verify their own compliance submission', () => {
    expect(hasPermission('field_inspector', 'compliance.submit')).toBe(false);
    expect(hasPermission('field_inspector', 'compliance.verify')).toBe(false);
  });
});

describe('permission helpers', () => {
  it('hasAnyPermission accepts a single match', () => {
    expect(hasAnyPermission('field_inspector', ['admin.users', 'inspection.create'])).toBe(true);
    expect(hasAnyPermission('field_inspector', ['admin.users', 'audit.export'])).toBe(false);
  });

  it('hasAllPermissions requires every permission', () => {
    expect(hasAllPermissions('field_inspector', ['inspection.create', 'inspection.edit'])).toBe(true);
    expect(hasAllPermissions('field_inspector', ['inspection.create', 'admin.users'])).toBe(false);
  });

  it('permissionsFor returns a stable, non-empty list per role', () => {
    for (const role of ROLES) {
      const list = permissionsFor(role);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('explains a denial in human-readable terms', () => {
    const reason = permissionDeniedReason('admin.users');
    expect(reason.length).toBeGreaterThan(10);
    expect(reason).not.toMatch(/admin\.users/);
  });
});

describe('mine scope', () => {
  const scoped = {
    role: 'mine_manager' as const,
    mineIds: ['mine-01'],
    subsidiaryIds: ['sub-01'],
  };

  it('allows an explicitly assigned mine', () => {
    expect(canAccessMine(scoped, 'mine-01', 'sub-02')).toBe(true);
  });

  it('denies a mine outside an explicit mine list even in the same subsidiary', () => {
    expect(canAccessMine(scoped, 'mine-02', 'sub-01')).toBe(false);
  });

  it('uses the subsidiary list when no mine list is assigned', () => {
    const subsidiaryScoped = { role: 'safety_officer' as const, mineIds: [], subsidiaryIds: ['sub-03'] };
    expect(canAccessMine(subsidiaryScoped, 'mine-09', 'sub-03')).toBe(true);
    expect(canAccessMine(subsidiaryScoped, 'mine-09', 'sub-01')).toBe(false);
  });

  it('treats an empty scope as organisation-wide', () => {
    const organisationWide = { role: 'compliance_officer' as const, mineIds: [], subsidiaryIds: [] };
    expect(canAccessMine(organisationWide, 'mine-99', undefined)).toBe(true);
  });

  it('always allows corporate, regulatory and system administration roles', () => {
    for (const role of ['corporate_management', 'regulatory_user', 'system_admin'] as const) {
      expect(canAccessMine({ role, mineIds: ['mine-01'], subsidiaryIds: [] }, 'mine-77')).toBe(true);
    }
  });
});
