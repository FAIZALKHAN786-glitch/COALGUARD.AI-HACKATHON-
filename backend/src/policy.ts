import { type AuthContext, type Role, permissionsFor } from './auth';

export const ORG_WIDE_ROLES = new Set<Role>([
  'system_admin',
  'corporate_management',
  'regulatory_user',
  'compliance_officer',
  'environmental_officer',
  'contractor_manager',
]);

export const MINE_SCOPED_ROLES = new Set<Role>([
  'mine_admin',
  'mine_manager',
  'safety_officer',
  'field_inspector',
]);

export function computeOrgWide(role: Role, mineIds: string[], subsidiaryIds: string[]): boolean {
  // If explicit scopes are assigned, user is scoped (even if role is org-wide capable)
  if (mineIds.length > 0 || subsidiaryIds.length > 0) {
    // Still check: if they have explicit scopes, restrict to them
    // Exception: if role is mine_scoped, they must have scopes (enforced elsewhere)
    if (MINE_SCOPED_ROLES.has(role)) return false;
    // For org-wide capable roles with explicit scopes, they're restricted to those scopes
    if (ORG_WIDE_ROLES.has(role)) return false;
    return false;
  }
  // No explicit scopes - org-wide only for certain roles
  if (MINE_SCOPED_ROLES.has(role)) return false; // mine-scoped roles need scopes
  if (ORG_WIDE_ROLES.has(role)) return true;
  return false;
}

export function hasPermission(context: AuthContext, permission: string): boolean {
  return context.permissions.includes(permission);
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  // Only system_admin can assign roles
  if (actorRole !== 'system_admin') return false;
  // System admin can assign any role including system_admin
  return true;
}

export function canModifyScopes(actorRole: Role): boolean {
  return actorRole === 'system_admin';
}

export function auditActionFor(actor: { id: string; name: string; role: string }, entityType: string, operation: string) {
  return {
    actor: { id: actor.id, name: actor.name, role: actor.role, ipHash: undefined as string | undefined },
    action: operation as any,
    entityType,
    entityId: '',
    entityLabel: '',
    requestId: '',
  };
}
