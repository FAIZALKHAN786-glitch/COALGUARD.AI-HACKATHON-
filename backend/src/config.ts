import path from 'node:path';

import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function text(name: string, fallback = ''): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : fallback;
}

function integer(name: string, fallback: number): number {
  const parsed = Number.parseInt(text(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolean(name: string, fallback: boolean): boolean {
  const value = text(name).toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

function list(name: string, fallback: string[] = []): string[] {
  const raw = text(name);
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const nodeEnv = text('NODE_ENV', 'development');
const authMode = text('AUTH_MODE', 'development') === 'oidc' ? 'oidc' : 'development';
const dataProvenance = text('DATA_PROVENANCE', 'development') === 'live' ? 'live' : 'development';

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  host: text('HOST', '127.0.0.1'),
  port: integer('PORT', 4000),
  databaseUrl:
    text('DATABASE_URL') ||
    'postgres://postgres:postgres@127.0.0.1:55432/coalguard',
  authMode,
  authTokenTtlMinutes: integer('AUTH_TOKEN_TTL_MINUTES', 480),
  authCookieName: text('AUTH_COOKIE_NAME', 'coalguard_session'),
  corsOrigins: list('CORS_ORIGINS', [
    'http://localhost:3000',
    'http://localhost:3100',
    'http://127.0.0.1:3000',
  ]),
  dataProvenance,
  allowDevSeed: boolean('ALLOW_DEV_SEED', nodeEnv !== 'production'),
  storageDir: path.resolve(process.cwd(), text('STORAGE_DIR', '.data/documents')),
  reportDir: path.resolve(process.cwd(), text('REPORT_DIR', '.data/reports')),
  todayOverride: text('COALGUARD_TODAY'),
  bodyLimitBytes: integer('BODY_LIMIT_BYTES', 1_048_576),
  documentMaxBytes: integer('DOCUMENT_MAX_BYTES', 5_242_880),
  rateLimitMax: integer('RATE_LIMIT_MAX', 600),
  rateLimitWindow: text('RATE_LIMIT_WINDOW', '1 minute'),
  enableInProcessScheduler: boolean('ENABLE_INPROCESS_SCHEDULER', false),
  schedulerIntervalSeconds: integer('SCHEDULER_INTERVAL_SECONDS', 300),
  logLevel: text('LOG_LEVEL', 'info'),
  // Explicit, reviewed allowlist. A production deployment must supply its own.
  version: '1.0.0',

  // --- Model API credentials (server-side only) ---
  predictiveAiApiKey: text('PREDICTIVE_AI_API_KEY'),
  chatbotApiKey: text('CHATBOT_API_KEY'),
  reasoningModelApiKey: text('REASONING_MODEL_API_KEY'),

  // --- Event streaming (Kafka) ---
  kafkaBootstrapServers: text('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092'),
  kafkaClientId: text('KAFKA_CLIENT_ID', 'coalguard-ai'),

  // --- Temporal workflow orchestration ---
  temporalAddress: text('TEMPORAL_ADDRESS', 'localhost:7233'),
  temporalNamespace: text('TEMPORAL_NAMESPACE', 'coalguard'),

  // --- AI service (FastAPI) ---
  aiDatabaseUrl: text('COALGUARD_AI_DATABASE_URL'),
  aiAuthMode: text('COALGUARD_AI_AUTH_MODE', 'development'),
  aiJwtSecret: text('COALGUARD_AI_JWT_SECRET', 'dev-secret-change-in-production'),
  aiJwtAlgorithm: text('COALGUARD_AI_JWT_ALGORITHM', 'HS256'),
  aiJwtExpiryMinutes: integer('COALGUARD_AI_JWT_EXPIRY_MINUTES', 480),
  aiCorsOrigins: list('COALGUARD_AI_CORS_ORIGINS', [
    'http://localhost:3000',
    'http://localhost:3100',
    'http://127.0.0.1:3000',
  ]),
  aiOcrLanguages: list('COALGUARD_AI_OCR_LANGUAGES', ['eng']),
  aiMaxBytes: integer('COALGUARD_AI_MAX_BYTES', 5_242_880),
  aiMaxPages: integer('COALGUARD_AI_MAX_PAGES', 50),
  aiSearchProvider: text('COALGUARD_AI_SEARCH_PROVIDER', 'mock'),
  aiSearchApiKey: text('COALGUARD_AI_SEARCH_API_KEY'),
  aiResearchMaxResults: integer('COALGUARD_AI_RESEARCH_MAX_RESULTS', 10),
  aiWorkflowMaxDurationMinutes: integer('COALGUARD_AI_WORKFLOW_MAX_DURATION_MINUTES', 60),
  aiWorkflowMaxToolCalls: integer('COALGUARD_AI_WORKFLOW_MAX_TOOL_CALLS', 50),
  aiChromaPath: text('COALGUARD_AI_CHROMA_PATH', './chroma_db'),
  aiEmbeddingModel: text('COALGUARD_AI_EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2'),

  // --- Data source catalog (official Indian coal-sector sources) ---
  dataSourceCatalogPath: text('DATA_SOURCE_CATALOG_PATH', './data/sources'),
} as const;

export type AppConfig = typeof config;

export function assertProductionSafety(current: AppConfig = config): void {
  if (!current.isProduction) return;
  if (current.authMode === 'development') {
    throw new Error(
      'Refusing to start: AUTH_MODE=development is not permitted with NODE_ENV=production. Configure an identity provider or run the development adapter outside production.',
    );
  }
  if (current.dataProvenance === 'development') {
    throw new Error(
      'Refusing to start: DATA_PROVENANCE=development is not permitted with NODE_ENV=production.',
    );
  }
  if (current.allowDevSeed) {
    throw new Error('Refusing to start: ALLOW_DEV_SEED must be false in production.');
  }
  // Model credentials must be configured in production/live mode
  if (!current.predictiveAiApiKey) {
    throw new Error(
      'Refusing to start: PREDICTIVE_AI_API_KEY is required in production. Configure the predictive AI provider credential.',
    );
  }
  if (!current.chatbotApiKey) {
    throw new Error(
      'Refusing to start: CHATBOT_API_KEY is required in production. Configure the conversational LLM provider credential.',
    );
  }
  if (!current.reasoningModelApiKey) {
    throw new Error(
      'Refusing to start: REASONING_MODEL_API_KEY is required in production. Configure the reasoning model provider credential.',
    );
  }
}

/**
 * Validate model credentials are configured when operating against live data.
 * Returns a clear error instead of silently falling back to simulated responses.
 */
export function validateModelCredentials(current: AppConfig = config): void {
  const missing: string[] = [];
  if (!current.predictiveAiApiKey) missing.push('PREDICTIVE_AI_API_KEY');
  if (!current.chatbotApiKey) missing.push('CHATBOT_API_KEY');
  if (!current.reasoningModelApiKey) missing.push('REASONING_MODEL_API_KEY');
  if (missing.length > 0) {
    throw new Error(
      `Missing required model API credentials: ${missing.join(', ')}. ` +
      'Configure these in .env.local or environment variables. ' +
      'The AI service will not fall back to simulated responses.',
    );
  }
}
