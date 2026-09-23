import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { loggerOptions } from './logger';
import { loadConfig, type AppConfig } from './config';
import { registerErrorHandlers } from './error-handler';
import { healthRoutes } from './routes/health';
import { conversationRoutes } from './routes/conversations';
import {
  createDatabase,
  createSchema,
  SQLiteConversationStore,
} from './adapters/sqlite-conversation-store';
import { OpenAICompatibleLLMProvider } from './adapters/openai-compatible-llm-provider';
import type { LLMProvider } from './ports/llm-provider';
import { ConversationService } from './services/conversation-service';

const API_PREFIX = '/api/v1';

export interface BuildAppOptions {
  config?: AppConfig;
  /** `false` silences logging (tests); default is Fastify's pino logger from env config. */
  logger?: boolean;
  /**
   * Database handle to use instead of opening one from config.DB_PATH.
   * Tests pass an in-memory DatabaseSync; when omitted the app opens (and
   * closes) the configured file database itself.
   */
  db?: DatabaseSync;
  /**
   * LLM provider override (tests inject a fake; the app never hits a real
   * model in the suite). Defaults to the configured OpenAI-compatible
   * adapter.
   */
  llm?: LLMProvider;
}

/**
 * Builds a configured Fastify instance without listening, so tests can use
 * `app.inject()` against the exact same wiring as production.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    // Fastify 5 only accepts a pino *instance* via `loggerInstance` (which
    // widens the logger generic and breaks shared types), so hand it a
    // config object and let Fastify construct the logger itself.
    logger: options.logger === false ? false : loggerOptions(config),
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
  });

  registerErrorHandlers(app);

  // Schema is applied here (not only in createDatabase) so an injected
  // handle — e.g. an in-memory database from tests — is initialized too.
  const db = options.db ?? createDatabase(config.DB_PATH);
  createSchema(db);
  app.addHook('onClose', async () => {
    db.close();
  });

  const llm =
    options.llm ??
    new OpenAICompatibleLLMProvider({
      apiKey: config.LLM_API_KEY,
      baseUrl: config.LLM_BASE_URL,
      model: config.LLM_MODEL,
      timeoutMs: config.LLM_TIMEOUT_MS,
    });
  const conversationService = new ConversationService(new SQLiteConversationStore(db), llm);

  await app.register(healthRoutes, { prefix: API_PREFIX });
  await app.register(conversationRoutes, {
    prefix: API_PREFIX,
    service: conversationService,
  });

  return app;
}
