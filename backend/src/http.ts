import { createHash } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import { config } from './config';
import type { Database } from './db';

export class AppError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: Record<string, string[]>): never {
  throw new AppError(400, 'validation_error', message, details);
}
export function notFound(entity = 'Record'): never {
  throw new AppError(404, 'not_found', `${entity} was not found.`);
}
export function forbidden(message = 'You do not have permission to perform this action.'): never {
  throw new AppError(403, 'forbidden', message);
}
export function conflict(message: string, code = 'conflict'): never {
  throw new AppError(409, code, message);
}

export function requireString(value: unknown, field: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim()) badRequest(`${field} is required.`, { [field]: ['Required'] });
  if (value.length > max) badRequest(`${field} is too long.`, { [field]: [`Maximum ${max} characters`] });
  return value.trim();
}
export function optionalString(value: unknown, field: string, max = 5000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') badRequest(`${field} must be a string.`, { [field]: ['Must be a string'] });
  if (value.length > max) badRequest(`${field} is too long.`, { [field]: [`Maximum ${max} characters`] });
  return value.trim();
}
export function requireNumber(value: unknown, field: string, min = -Infinity): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min) badRequest(`${field} is invalid.`, { [field]: ['Invalid number'] });
  return parsed;
}
export function requireEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    badRequest(`${field} is invalid.`, { [field]: [`Must be one of: ${values.join(', ')}`] });
  }
  return value as T;
}
export function requireArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    badRequest(`${field} must be an array of identifiers.`, { [field]: ['Invalid array'] });
  }
  return [...new Set(value as string[])];
}

export function optionalDate(value: unknown, field: string): string | undefined {
  const text = optionalString(value, field, 40);
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || Number.isNaN(new Date(text).getTime())) {
    badRequest(`${field} must be an ISO date.`, { [field]: ['Invalid date'] });
  }
  return text;
}

export function dateOnly(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function today(): string {
  return config.todayOverride || new Date().toISOString().slice(0, 10);
}

export function requestIpHash(request: FastifyRequest): string {
  return createHash('sha256').update(request.ip || 'unknown').digest('hex').slice(0, 32);
}

export function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function nextCode(
  db: Database | { query: Database['query'] },
  table: string,
  column: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${table}:${prefix}`]);
  const result = await db.query<{ code: string }>(
    `SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}-${year}-%`],
  );
  const last = result.rows[0]?.code;
  const sequence = last ? Number(last.split('-').at(-1)) + 1 : 1;
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}

export type Query = Record<string, string | string[] | undefined>;

export function queryValue(query: Query, key: string): string | undefined {
  const value = query[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function queryArray(query: Query, key: string): string[] {
  const value = query[key];
  if (Array.isArray(value)) return value.flatMap((entry) => entry.split(',')).filter(Boolean);
  return value ? value.split(',').filter(Boolean) : [];
}

export interface ListOptions {
  page: number;
  pageSize: number;
  offset: number;
  search?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

export function listOptions(query: Query, defaultSort = 'updated_at'): ListOptions {
  const page = Math.max(1, Number.parseInt(queryValue(query, 'page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(queryValue(query, 'pageSize') ?? '20', 10) || 20));
  const sortDir = queryValue(query, 'sortDir') === 'asc' ? 'asc' : 'desc';
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: queryValue(query, 'search')?.trim() || undefined,
    sortBy: queryValue(query, 'sortBy') || defaultSort,
    sortDir,
  };
}

export function sortColumn(requested: string | undefined, allowed: Record<string, string>, fallback: string): string {
  return (requested && allowed[requested]) || fallback;
}

export function meta(total: number, options: ListOptions, stale = false) {
  return {
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    hasNextPage: options.offset + options.pageSize < total,
    hasPreviousPage: options.page > 1,
    source: config.dataProvenance,
    generatedAt: new Date().toISOString(),
    ...(stale ? { stale: true } : {}),
  };
}

export function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function boolOrUndefined(value: unknown): boolean | undefined {
  if (value === 'true' || value === '1' || value === true) return true;
  if (value === 'false' || value === '0' || value === false) return false;
  return undefined;
}

export function compact<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as T;
}

export function locationOf(row: Record<string, any>) {
  if (row.latitude === null || row.latitude === undefined || row.longitude === null) return undefined;
  return compact({
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    accuracyM: numberOrUndefined(row.geo_accuracy_m),
    source: row.geo_source ?? undefined,
    capturedAt: row.geo_captured_at ? new Date(row.geo_captured_at).toISOString() : undefined,
  });
}

export function auditMineIdsFromEntity(entityType: string, row: Record<string, any>): string[] {
  const mineId = row.mine_id ?? row.mineId;
  if (mineId) return [mineId];
  if (entityType === 'mine' && row.id) return [row.id];
  return [];
}
