import { createHash, randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { authenticate } from './auth';
import { assertProductionSafety, config } from './config';
import { createDatabase, type Database } from './db';
import { AppError } from './http';
import { registerAuthRoutes } from './routes/auth';
import { registerAssuranceRoutes } from './routes/assurance';
import { registerCoreRoutes } from './routes/core';
import { registerGovernanceRoutes } from './routes/governance';
import { registerIngestionRoutes } from './routes/ingestion';
import { registerAIRoutes } from './routes/ai';
import { registerOperationRoutes } from './routes/operations';

declare module 'fastify' {
  interface FastifyRequest {
    auth: import('./auth').AuthContext;
    requestId: string;
  }
}

const PUBLIC_EXACT = new Set([
  '/health',
  '/api/v1/health',
  '/api/v1/auth/sign-in',
  '/api/v1/auth/identities',
]);
const PUBLIC_PREFIXES = ['/docs'];

function isPublic(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0] ?? '';
  if (request.method === 'OPTIONS') return true;
  return PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export interface BuildAppOptions {
  db?: Database;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  assertProductionSafety();
  const db = options.db ?? createDatabase();
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'res.body.accessToken'],
              censor: '[redacted]',
            },
            serializers: {
              req(request) {
                return { method: request.method, url: request.url, id: (request as any).id };
              },
            },
          },
    bodyLimit: config.bodyLimitBytes,
    trustProxy: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => `req-${randomUUID()}`,
  });

  app.decorateRequest('auth', null as unknown as import('./auth').AuthContext);
  app.decorateRequest('requestId', '');

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    credentials: false,
    maxAge: 600,
  });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    allowList: (request) => request.url === '/health' || request.url === '/api/v1/health',
    keyGenerator: (request) => request.ip,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'CoalGuard.AI API',
        description:
          'Transactional API for coal mining compliance, inspections, safety, environment, production, contractors, workforce, reporting, audit and deterministic retrieval.',
        version: config.version,
      },
      servers: [{ url: 'http://localhost:4000/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addHook('onRequest', async (request, reply) => {
    request.requestId = request.id;
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
  });

  app.addHook('preHandler', async (request, reply) => {
    if (isPublic(request)) return;
    const context = await authenticate(db, request);
    request.auth = context;
    request.requestId = (request as any).requestId || request.id;
    (context as { requestId: string }).requestId = request.requestId;

    const key = request.headers['idempotency-key'];
    if (!key || !['POST', 'PATCH', 'PUT'].includes(request.method)) return;
    if (String(key).length > 200) throw new AppError(400, 'validation_error', 'Idempotency-Key is too long.');
    const fingerprint = createHash('sha256')
      .update(`${request.method}\n${request.url.split('?')[0]}\n${JSON.stringify(request.body ?? null)}`)
      .digest('hex');
    const existing = await db.one<{
      request_fingerprint: string;
      response_status: number | null;
      response_body: unknown;
    }>('SELECT request_fingerprint,response_status,response_body FROM idempotency_keys WHERE user_id=$1 AND idempotency_key=$2', [
      context.user.id,
      String(key),
    ]);
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) {
        throw new AppError(409, 'idempotency_conflict', 'That Idempotency-Key was already used for a different request.');
      }
      if (existing.response_status && existing.response_body !== null) {
        reply.status(existing.response_status).type('application/json').send(existing.response_body);
        return reply;
      }
      throw new AppError(409, 'idempotency_in_progress', 'A request with that Idempotency-Key is still being processed.');
    }
    const reserved = await db.query(
      `INSERT INTO idempotency_keys (user_id,idempotency_key,method,path,request_fingerprint)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,idempotency_key) DO NOTHING`,
      [context.user.id, String(key), request.method, request.url.split('?')[0], fingerprint],
    );
    if (reserved.rowCount === 0) {
      const raced = await db.one<{
        request_fingerprint: string;
        response_status: number | null;
        response_body: unknown;
      }>('SELECT request_fingerprint,response_status,response_body FROM idempotency_keys WHERE user_id=$1 AND idempotency_key=$2', [
        context.user.id,
        String(key),
      ]);
      if (raced && raced.request_fingerprint !== fingerprint) {
        throw new AppError(409, 'idempotency_conflict', 'That Idempotency-Key was already used for a different request.');
      }
      if (raced?.response_status && raced.response_body !== null) {
        reply.status(raced.response_status).type('application/json').send(raced.response_body);
        return reply;
      }
      throw new AppError(409, 'idempotency_in_progress', 'A request with that Idempotency-Key is still being processed.');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = request.headers['idempotency-key'];
    if (!key || !request.auth || request.method === 'GET') return payload;
    if (reply.statusCode >= 400) {
      // A failed request must not block a corrected retry with the same key.
      await db
        .query('DELETE FROM idempotency_keys WHERE user_id=$1 AND idempotency_key=$2 AND response_status IS NULL', [
          request.auth.user.id,
          String(key),
        ])
        .catch(() => undefined);
      return payload;
    }
    if (typeof payload !== 'string' || !payload) {
      await db
        .query('DELETE FROM idempotency_keys WHERE user_id=$1 AND idempotency_key=$2 AND response_status IS NULL', [
          request.auth.user.id,
          String(key),
        ])
        .catch(() => undefined);
      return payload;
    }
    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      await db
        .query('DELETE FROM idempotency_keys WHERE user_id=$1 AND idempotency_key=$2 AND response_status IS NULL', [
          request.auth.user.id,
          String(key),
        ])
        .catch(() => undefined);
      return payload;
    }
    const fingerprint = createHash('sha256')
      .update(`${request.method}\n${request.url.split('?')[0]}\n${JSON.stringify(request.body ?? null)}`)
      .digest('hex');
    await db
      .query(
        `UPDATE idempotency_keys
         SET response_status=$5,response_body=$6::jsonb
         WHERE user_id=$1 AND idempotency_key=$2 AND method=$3 AND path=$4 AND request_fingerprint=$7`,
        [
          request.auth.user.id,
          String(key),
          request.method,
          request.url.split('?')[0],
          reply.statusCode,
          JSON.stringify(body),
          fingerprint,
        ],
      )
      .catch(() => undefined);
    return payload;
  });

  app.get('/health', async () => health(db));
  app.get('/api/v1/health', async () => health(db));

  await registerAuthRoutes(app, db);
  await registerCoreRoutes(app, db);
  await registerAssuranceRoutes(app, db);
  await registerOperationRoutes(app, db);
  await registerGovernanceRoutes(app, db);
  await registerIngestionRoutes(app, db);
  await registerAIRoutes(app, db);

  app.setNotFoundHandler(async (request) => {
    throw new AppError(404, 'not_found', `No route matches ${request.method} ${request.url.split('?')[0]}.`);
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      // Log authorization denials
      if ((error.status === 401 || error.status === 403) && (request as any).auth?.user) {
        try {
          const { appendAudit } = await import('./audit');
          const authCtx = (request as any).auth;
          await (appendAudit as any)(db, {
            actor: { id: authCtx.user.id, name: authCtx.user.name, role: authCtx.user.role, ipHash: authCtx.ipHash },
            action: 'authorization_denied' as any,
            entityType: 'api_request',
            entityId: request.url.split('?')[0],
            entityLabel: `${request.method} ${request.url.split('?')[0]}`,
            reason: error.message?.slice(0, 500),
            requestId: request.requestId || request.id,
          } as any);
        } catch {}
      }
      return reply.status(error.status).send({
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId: request.requestId || request.id,
      });
    }
    const databaseCode = (error as { code?: string }).code;
    if (databaseCode === '23505') {
      return reply.status(409).send({
        code: 'conflict',
        message: 'A record with those unique values already exists.',
        requestId: request.requestId || request.id,
      });
    }
    if (databaseCode === '23503') {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'A referenced record does not exist or is still in use.',
        requestId: request.requestId || request.id,
      });
    }
    if (databaseCode === '23514' || databaseCode === '22P02' || databaseCode === '22007' || databaseCode === '22003') {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'The submitted data violates a database constraint.',
        requestId: request.requestId || request.id,
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.status(statusCode).send({
        code: 'bad_request',
        message: error.message,
        requestId: request.requestId || request.id,
      });
    }
    request.log.error({ err: error, requestId: request.requestId }, 'unhandled_request_error');
    return reply.status(500).send({
      code: 'server_error',
      message: 'The server could not complete the request.',
      requestId: request.requestId || request.id,
    });
  });

  app.addHook('onClose', async () => {
    if (!options.db) await db.close();
  });

  return app;
}

async function health(db: Database) {
  const started = Date.now();
  try {
    await db.query('SELECT 1');
    return {
      status: 'ok',
      database: 'reachable',
      latencyMs: Date.now() - started,
      source: config.dataProvenance,
      externalServices: {
        ocr: 'not_configured',
        messaging: 'not_configured',
        ledger: 'not_configured',
        identityProvider: config.authMode === 'development' ? 'development_adapter' : 'configured',
      },
      timestamp: new Date().toISOString(),
      version: config.version,
    };
  } catch (error) {
    throw new AppError(503, 'database_unavailable', 'The database is not reachable.');
  }
}

export async function exportOpenApi(app: FastifyInstance): Promise<unknown> {
  await app.ready();
  return app.swagger();
}
