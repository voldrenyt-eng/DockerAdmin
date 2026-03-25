import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { DEFAULT_WEB_ORIGIN, normalizeWebOrigin } from "./security.js";

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, override: false });
    break;
  }
}

const apiConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATA_ROOT: z.string().min(1).default("data"),
  DEPLOY_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  ENV_ENCRYPTION_KEY: z.string().min(1, "ENV_ENCRYPTION_KEY is required"),
  HOST: z.string().min(1).default("0.0.0.0"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  TELEGRAM_BOT_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  TELEGRAM_CHAT_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  WEB_ORIGIN: z
    .string()
    .url()
    .transform(normalizeWebOrigin)
    .default(DEFAULT_WEB_ORIGIN),
});

export type ApiConfig = {
  databaseUrl: string;
  dataRoot: string;
  deployTimeoutMs: number;
  envEncryptionKey: string;
  host: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  nodeEnv: "development" | "test" | "production";
  port: number;
  telegramBotToken?: string;
  telegramChatId?: string;
  webOrigin: string;
};

const formatIssues = (issues: z.ZodIssue[]): string => {
  const fields = new Set(
    issues.flatMap((issue) => {
      return issue.path.length > 0 ? [String(issue.path[0])] : [];
    }),
  );

  return Array.from(fields).join(", ");
};

export const createApiConfig = (input: NodeJS.ProcessEnv): ApiConfig => {
  const parsed = apiConfigSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      `Invalid API environment configuration. Missing or invalid: ${formatIssues(parsed.error.issues)}`,
    );
  }

  const config: ApiConfig = {
    databaseUrl: parsed.data.DATABASE_URL,
    dataRoot: parsed.data.DATA_ROOT,
    deployTimeoutMs: parsed.data.DEPLOY_TIMEOUT_MS,
    envEncryptionKey: parsed.data.ENV_ENCRYPTION_KEY,
    host: parsed.data.HOST,
    jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
    jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    webOrigin: parsed.data.WEB_ORIGIN,
  };

  if (parsed.data.TELEGRAM_BOT_TOKEN) {
    config.telegramBotToken = parsed.data.TELEGRAM_BOT_TOKEN;
  }

  if (parsed.data.TELEGRAM_CHAT_ID) {
    config.telegramChatId = parsed.data.TELEGRAM_CHAT_ID;
  }

  return config;
};

export const loadApiConfig = (): ApiConfig => {
  return createApiConfig(process.env);
};
