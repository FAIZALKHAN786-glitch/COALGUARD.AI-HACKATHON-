import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import { appendAudit } from './audit';
import { config } from './config';
import type { Database } from './db';
import { AppError, forbidden, requestIpHash } from './http';

export const ROLES = [
  'mine_admin', 'mine_manager', 'safety_officer', 'environmental_officer',
  'compliance_officer', 'field_inspector', 'contractor_manager',
  'corporate_management', 'regulatory_user', 'system_admin',
] as const;
export type Role = (typeof ROLES)[number];

export type Permission = string;

const P = {
  mine_admin: ['dashboard.view','mine.view','mine.edit','subsidiary.view','compliance.view','compliance.edit','compliance.submit','inspection.view','inspection.create','inspection.edit','inspection.submit','safety.view','safety.create','safety.edit','environment.view','environment.create','production.view','production.create','contractor.view','workforce.view','workforce.edit','corrective_action.view','corrective_action.create','corrective_action.edit','corrective_action.complete','map.view','map.report_location','document.view','document.upload','analytics.view','analytics.review','notification.view','report.view','report.generate','report.download','audit.view','assistant.use'],
  mine_manager: ['dashboard.view','mine.view','subsidiary.view','compliance.view','compliance.edit','compliance.submit','inspection.view','inspection.create','inspection.edit','inspection.submit','inspection.review','safety.view','safety.create','safety.edit','safety.investigate','safety.close','environment.view','environment.create','production.view','production.create','production.approve','contractor.view','workforce.view','workforce.edit','workforce.approve','corrective_action.view','corrective_action.create','corrective_action.edit','corrective_action.complete','corrective_action.verify','map.view','map.report_location','document.view','document.upload','analytics.view','analytics.review','notification.view','report.view','report.generate','report.download','audit.view','assistant.use'],
  safety_officer: ['dashboard.view','mine.view','compliance.view','inspection.view','inspection.create','inspection.edit','inspection.submit','safety.view','safety.create','safety.edit','safety.investigate','corrective_action.view','corrective_action.create','corrective_action.edit','corrective_action.complete','map.view','map.report_location','document.view','document.upload','analytics.view','analytics.review','notification.view','report.view','report.download','assistant.use'],
  environmental_officer: ['dashboard.view','mine.view','compliance.view','inspection.view','inspection.create','inspection.edit','inspection.submit','safety.view','safety.create','environment.view','environment.create','environment.edit','environment.export','production.view','corrective_action.view','corrective_action.create','corrective_action.edit','map.view','map.report_location','document.view','document.upload','analytics.view','notification.view','report.view','report.download','assistant.use'],
  compliance_officer: ['dashboard.view','mine.view','subsidiary.view','compliance.view','compliance.create','compliance.edit','compliance.submit','compliance.verify','compliance.export','inspection.view','inspection.review','safety.view','environment.view','production.view','contractor.view','corrective_action.view','corrective_action.create','corrective_action.edit','corrective_action.verify','map.view','document.view','document.upload','analytics.view','analytics.review','notification.view','report.view','report.generate','report.download','audit.view','assistant.use'],
  field_inspector: ['dashboard.view','mine.view','compliance.view','inspection.view','inspection.create','inspection.edit','inspection.submit','safety.view','safety.create','environment.view','production.view','corrective_action.view','corrective_action.create','map.view','map.report_location','document.view','document.upload','notification.view','report.view','assistant.use'],
  contractor_manager: ['dashboard.view','mine.view','compliance.view','inspection.view','safety.view','environment.view','production.view','contractor.view','contractor.create','contractor.edit','contractor.view_documents','workforce.view','workforce.edit','workforce.approve','corrective_action.view','corrective_action.create','map.view','document.view','document.upload','notification.view','report.view','assistant.use'],
  corporate_management: ['dashboard.view','mine.view','subsidiary.view','compliance.view','compliance.export','inspection.view','safety.view','environment.view','environment.export','production.view','production.export','contractor.view','contractor.view_documents','workforce.view','corrective_action.view','map.view','document.view','analytics.view','analytics.review','analytics.dismiss','analytics.escalate','notification.view','report.view','report.generate','report.download','audit.view','audit.export','assistant.use'],
  regulatory_user: ['dashboard.view','mine.view','subsidiary.view','compliance.view','compliance.export','inspection.view','safety.view','environment.view','environment.export','production.view','contractor.view','workforce.view','corrective_action.view','map.view','document.view','analytics.view','notification.view','report.view','report.generate','report.download','audit.view','audit.export','assistant.use'],
  system_admin: ['dashboard.view','mine.view','mine.create','mine.edit','mine.archive','subsidiary.view','subsidiary.edit','compliance.view','compliance.create','compliance.edit','inspection.view','inspection.create','inspection.edit','safety.view','safety.create','safety.edit','environment.view','environment.create','environment.edit','production.view','production.approve','contractor.view','contractor.create','contractor.edit','contractor.archive','contractor.view_documents','workforce.view','workforce.view_personal','workforce.edit','workforce.approve','corrective_action.view','corrective_action.create','corrective_action.edit','corrective_action.complete','corrective_action.verify','map.view','map.report_location','document.view','document.upload','document.review','document.delete','analytics.view','analytics.review','analytics.dismiss','analytics.escalate','notification.view','notification.manage','report.view','report.generate','report.download','audit.view','audit.export','assistant.use','admin.access','admin.users','admin.config','admin.workflows','admin.integrations'],
} satisfies Record<Role, string[]>;

const ORG_WIDE_CAPABLE = new Set<Role>([
  'system_admin',
  'corporate_management',
  'regulatory_user',
  'compliance_officer',
  'environmental_officer',
  'contractor_manager',
]);
const MINE_SCOPED_ROLES = new Set<Role>([
  'mine_admin',
  'mine_manager',
  'safety_officer',
  'field_inspector',
]);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  mineIds: string[];
  subsidiaryIds: string[];
  effectiveMineIds: string[];
  orgWide: boolean;
  developmentIdentity: boolean;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  token: string;
  permissions: readonly string[];
  ipHash: string;
  requestId: string;
  canAccessMine(mineId: string, subsidiaryId?: string): boolean;
  require(permission: Permission): void;
}

export function permissionsFor(role: Role): readonly string[] {
  return P[role] ?? [];
}

function computeScope(user: Pick<AuthUser, 'role' | 'mineIds' | 'subsidiaryIds' | 'effectiveMineIds'> & { orgWide?: boolean }) {
  // If explicit scopes assigned, always scope-restricted
  if (user.mineIds.length > 0 || user.subsidiaryIds.length > 0) {
    return { orgWide: false, effectiveMineIds: user.effectiveMineIds.length > 0 ? user.effectiveMineIds : user.mineIds };
  }
  // No explicit scopes
  if (MINE_SCOPED_ROLES.has(user.role)) {
    return { orgWide: false, effectiveMineIds: [] }; // deny by default
  }
  if (ORG_WIDE_CAPABLE.has(user.role)) {
    return { orgWide: true, effectiveMineIds: user.effectiveMineIds };
  }
  return { orgWide: false, effectiveMineIds: [] };
}

export function canAccessMine(
  user: Pick<AuthUser, 'role' | 'mineIds' | 'subsidiaryIds' | 'effectiveMineIds'> & { orgWide?: boolean },
  mineId: string,
  mineSubsidiaryId?: string,
): boolean {
  const scope = computeScope(user as any);
  if (scope.orgWide) return true;
  const effective = scope.effectiveMineIds.length > 0 ? scope.effectiveMineIds : user.mineIds;
  if (effective.length > 0) return effective.includes(mineId);
  if (user.subsidiaryIds.length > 0 && mineSubsidiaryId) return user.subsidiaryIds.includes(mineSubsidiaryId);
  // No scopes and not org-wide => deny
  return false;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function userFromRow(row: Record<string, any>): AuthUser {
  const mineIds = row.mine_ids ?? row.mineIds ?? [];
  const subsidiaryIds = row.subsidiary_ids ?? row.subsidiaryIds ?? [];
  const effectiveMineIds = row.effective_mine_ids ?? row.effectiveMineIds ?? mineIds;
  const role = row.role as Role;
  const scope = computeScope({ role, mineIds, subsidiaryIds, effectiveMineIds });
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    title: row.title ?? '',
    mineIds,
    subsidiaryIds,
    effectiveMineIds: scope.effectiveMineIds,
    orgWide: scope.orgWide,
    developmentIdentity: Boolean(row.development_identity ?? row.developmentIdentity),
  };
}

export async function loadUser(db: Database | { query: Database['query'] }, userId: string): Promise<AuthUser | null> {
  const result = await db.query(
    `SELECT u.*,
            COALESCE(ms.mine_ids, '{}') AS mine_ids,
            COALESCE(ss.subsidiary_ids, '{}') AS subsidiary_ids,
            COALESCE(
              ARRAY(
                SELECT DISTINCT m2.id
                FROM user_mine_scopes ums
                JOIN mines m2 ON m2.id = ums.mine_id
                WHERE ums.user_id = u.id
                UNION
                SELECT m3.id
                FROM user_subsidiary_scopes uss
                JOIN mines m3 ON m3.subsidiary_id = uss.subsidiary_id
                WHERE uss.user_id = u.id
              ),
              '{}'
            ) AS effective_mine_ids
     FROM users u
     LEFT JOIN LATERAL (SELECT array_agg(mine_id) AS mine_ids FROM user_mine_scopes WHERE user_id = u.id) ms ON true
     LEFT JOIN LATERAL (SELECT array_agg(subsidiary_id) AS subsidiary_ids FROM user_subsidiary_scopes WHERE user_id = u.id) ss ON true
     WHERE u.id = $1 AND u.deactivated_at IS NULL`,
    [userId],
  );
  return result.rows[0] ? userFromRow(result.rows[0]) : null;
}

export async function createSession(
  db: Database,
  user: AuthUser,
  userAgent: string | undefined,
  ipHash: string,
): Promise<{ token: string; issuedAt: string; expiresAt: string; sessionId: string }> {
  const token = randomBytes(32).toString('base64url');
  const sessionId = `ses-${randomUUID()}`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + config.authTokenTtlMinutes * 60_000);
  await db.query(
    `INSERT INTO user_sessions (id, user_id, token_hash, issued_at, expires_at, user_agent, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sessionId, user.id, hashToken(token), issuedAt, expiresAt, userAgent?.slice(0, 300) ?? null, ipHash],
  );
  return { token, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), sessionId };
}

export function sessionPayload(user: AuthUser, issuedAt: string | Date, expiresAt: string | Date, accessToken?: string) {
  const perms = permissionsFor(user.role);
  return {
    user: { ...user, permissions: perms },
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    development: config.authMode === 'development' || user.developmentIdentity,
    ...(accessToken ? { accessToken } : {}),
  };
}

export async function authenticate(db: Database, request: FastifyRequest): Promise<AuthContext> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'unauthenticated', 'A bearer token is required.');
  }
  const token = header.slice('Bearer '.length).trim();
  const result = await db.query(
    `SELECT s.id AS session_id, s.issued_at, s.expires_at, u.*,
            COALESCE(ms.mine_ids, '{}') AS mine_ids,
            COALESCE(ss.subsidiary_ids, '{}') AS subsidiary_ids,
            COALESCE(
              ARRAY(
                SELECT DISTINCT m2.id
                FROM user_mine_scopes ums
                JOIN mines m2 ON m2.id = ums.mine_id
                WHERE ums.user_id = u.id
                UNION
                SELECT m3.id
                FROM user_subsidiary_scopes uss
                JOIN mines m3 ON m3.subsidiary_id = uss.subsidiary_id
                WHERE uss.user_id = u.id
              ),
              '{}'
            ) AS effective_mine_ids
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN LATERAL (SELECT array_agg(mine_id) AS mine_ids FROM user_mine_scopes WHERE user_id = u.id) ms ON true
     LEFT JOIN LATERAL (SELECT array_agg(subsidiary_id) AS subsidiary_ids FROM user_subsidiary_scopes WHERE user_id = u.id) ss ON true
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
       AND u.deactivated_at IS NULL`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(401, 'session_expired', 'The session is invalid or has expired.');
  const user = userFromRow(row);
  const permissions = permissionsFor(user.role);
  return {
    user,
    sessionId: row.session_id,
    token,
    permissions,
    ipHash: requestIpHash(request),
    requestId: (request as any).requestId ?? '',
    canAccessMine: (mineId, subsidiaryId) => canAccessMine(user, mineId, subsidiaryId),
    require: (permission) => {
      if (!permissions.includes(permission)) forbidden(`Missing permission: ${permission}`);
    },
  };
}

export async function auditLogin(db: Database, user: AuthUser, ipHash: string, requestId: string): Promise<void> {
  await db.transaction(async (client) => {
    await appendAudit(client, {
      actor: { id: user.id, name: user.name, role: user.role, ipHash },
      action: 'login',
      entityType: 'session',
      entityId: user.id,
      entityLabel: `${user.name} signed in`,
      updatedValue: { development: config.authMode === 'development' },
      requestId,
    });
  });
}

export function scopeSql(
  auth: AuthContext,
  alias: string,
  mineExpression = `${alias}.mine_id`,
  subsidiaryExpression?: string,
): { sql: string; params: unknown[] } {
  if (['system_admin', 'corporate_management', 'regulatory_user'].includes(auth.user.role)) {
    return { sql: 'TRUE', params: [] };
  }
  if (auth.user.mineIds.length > 0) {
    return { sql: `${mineExpression} = ANY($SCOPE_MINES)`, params: [auth.user.mineIds], scopeMines: true } as never;
  }
  if (auth.user.subsidiaryIds.length > 0 && subsidiaryExpression) {
    return {
      sql: `${subsidiaryExpression} = ANY($SCOPE_SUBSIDIARIES)`,
      params: [auth.user.subsidiaryIds],
      scopeSubsidiaries: true,
    } as never;
  }
  return { sql: 'TRUE', params: [] };
}

/** Adds a scope predicate while keeping parameter numbering correct. */
export function addScope(
  auth: AuthContext,
  params: unknown[],
  mineExpression: string,
  subsidiaryExpression?: string,
): string {
  const user = auth.user as any;
  // Recompute scope
  if (user.orgWide) return 'TRUE';
  const effective = user.effectiveMineIds && user.effectiveMineIds.length > 0 ? user.effectiveMineIds : user.mineIds;
  if (effective.length > 0) {
    params.push(effective);
    return `${mineExpression} = ANY($${params.length}::text[])`;
  }
  if (user.subsidiaryIds && user.subsidiaryIds.length > 0 && subsidiaryExpression) {
    params.push(user.subsidiaryIds);
    return `${subsidiaryExpression} = ANY($${params.length}::text[])`;
  }
  // Deny by default for unscoped mine-scoped users
  return 'FALSE';
}

export { hashToken };
