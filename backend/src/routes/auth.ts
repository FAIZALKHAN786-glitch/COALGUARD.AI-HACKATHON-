import type { FastifyInstance, FastifyRequest } from 'fastify';

import { appendAudit } from '../audit';
import {
  auditLogin,
  createSession,
  loadUser,
  sessionPayload,
  type AuthContext,
} from '../auth';
import { config } from '../config';
import type { Database } from '../db';
import { AppError, badRequest, optionalString, requireString } from '../http';
import { serializeUser } from '../serializers';

function auth(req: FastifyRequest): AuthContext {
  return (req as any).auth as AuthContext;
}

export async function registerAuthRoutes(app: FastifyInstance, db: Database): Promise<void> {
  app.post('/api/v1/auth/sign-in', async (req) => {
    if (config.authMode !== 'development') {
      throw new AppError(501, 'identity_provider_unavailable', 'OIDC sign-in is not implemented in this build.');
    }
    const body = req.body as Record<string, unknown>;
    const email = requireString(body.email, 'email', 320).toLowerCase();
    // Passwords are deliberately not evaluated by the development adapter. The
    // response and UI label the session as a development identity.
    void optionalString(body.password, 'password', 500);
    const result = await db.query(
      `SELECT u.*, COALESCE(ms.mine_ids, '{}') AS mine_ids,
              COALESCE(ss.subsidiary_ids, '{}') AS subsidiary_ids
       FROM users u
       LEFT JOIN LATERAL (SELECT array_agg(mine_id) AS mine_ids FROM user_mine_scopes WHERE user_id=u.id) ms ON true
       LEFT JOIN LATERAL (SELECT array_agg(subsidiary_id) AS subsidiary_ids FROM user_subsidiary_scopes WHERE user_id=u.id) ss ON true
       WHERE u.email=$1 AND u.deactivated_at IS NULL`,
      [email],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(401, 'invalid_credentials', 'No active development identity matches that email address.');
    const user = {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      role: row.role as never,
      title: row.title as string,
      mineIds: (row.mine_ids ?? []) as string[],
      subsidiaryIds: (row.subsidiary_ids ?? []) as string[],
      developmentIdentity: Boolean(row.development_identity),
    };
    const { userFromRow } = await import('../auth');
    const fullUser = userFromRow({ ...row, mine_ids: row.mine_ids, subsidiary_ids: row.subsidiary_ids });
    const ipHash = authIpHash(req);
    const session = await createSession(db, fullUser, req.headers['user-agent'], ipHash);
    await db.query('UPDATE users SET last_login_at=now() WHERE id=$1', [fullUser.id]);
    await auditLogin(db, fullUser, ipHash, (req as any).requestId ?? '');
    return sessionPayload(fullUser, session.issuedAt, session.expiresAt, session.token);
  });

  app.get('/api/v1/auth/identities', async () => {
    if (config.authMode !== 'development') {
      throw new AppError(404, 'not_found', 'Development identities are not available.');
    }
    const rows = await db.many(
      `SELECT u.*, COALESCE(ms.mine_ids, '{}') AS mine_ids,
              COALESCE(ss.subsidiary_ids, '{}') AS subsidiary_ids
       FROM users u
       LEFT JOIN LATERAL (SELECT array_agg(mine_id) AS mine_ids FROM user_mine_scopes WHERE user_id=u.id) ms ON true
       LEFT JOIN LATERAL (SELECT array_agg(subsidiary_id) AS subsidiary_ids FROM user_subsidiary_scopes WHERE user_id=u.id) ss ON true
       WHERE u.deactivated_at IS NULL ORDER BY u.name`,
    );
    return rows.map(serializeUser);
  });

  app.get('/api/v1/auth/session', async (req) => {
    const context = auth(req);
    const row = await db.one('SELECT issued_at,expires_at FROM user_sessions WHERE id=$1', [context.sessionId]);
    if (!row) throw new AppError(401, 'session_expired', 'The session is no longer active.');
    return sessionPayload(context.user, row.issued_at, row.expires_at);
  });

  app.patch('/api/v1/auth/profile', async (req) => {
    const context = auth(req);
    const body = req.body as Record<string, unknown>;
    const name = requireString(body.name, 'name', 160);
    const title = requireString(body.title, 'title', 160);
    const updated = await db.transaction(async (client) => {
      const result = await client.query('UPDATE users SET name=$2,title=$3,updated_at=now() WHERE id=$1 RETURNING *', [
        context.user.id,
        name,
        title,
      ]);
      await appendAudit(client, {
        actor: { id: context.user.id, name, role: context.user.role, ipHash: context.ipHash },
        action: 'update',
        entityType: 'user',
        entityId: context.user.id,
        entityLabel: name,
        previousValue: { name: context.user.name, title: context.user.title },
        updatedValue: { name, title },
        requestId: context.requestId,
      });
      return result.rows[0];
    });
    const { userFromRow } = await import('../auth');
    const full = userFromRow({ ...updated, mine_ids: context.user.mineIds, subsidiary_ids: context.user.subsidiaryIds });
    return serializeUser({ ...updated, mine_ids: full.mineIds, subsidiary_ids: full.subsidiaryIds });
  });

  app.post('/api/v1/auth/sign-out', async (req, reply) => {
    const context = auth(req);
    await db.transaction(async (client) => {
      await client.query('UPDATE user_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL', [context.sessionId]);
      await appendAudit(client, {
        actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
        action: 'logout',
        entityType: 'session',
        entityId: context.sessionId,
        entityLabel: `${context.user.name} signed out`,
        requestId: context.requestId,
      });
    });
    reply.status(204);
    return undefined;
  });
}

function authIpHash(req: FastifyRequest): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(req.ip || 'unknown').digest('hex').slice(0, 32);
}
