import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  // SQLite database file. Use ':memory:' for ephemeral stores (tests).
  DB_PATH: z.string().min(1).default('./data/jarvis.db'),
  // LLM reply generation (OpenAI-compatible APIs: OpenAI, Ollama, LM Studio...).
  // An empty LLM_API_KEY is allowed at boot — history still serves — but
  // sending a message then fails with a clear 502 naming the variable.
  LLM_BASE_URL: z
    .string()
    .url()
    .default('https://api.openai.com/v1')
    .transform((value) => value.replace(/\/+$/, '')),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().min(1).default('gpt-4o-mini'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Validates environment configuration against a zod schema and fails fast
 * with a readable message listing every offending variable. All config must
 * flow through here — never read process.env directly elsewhere.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
