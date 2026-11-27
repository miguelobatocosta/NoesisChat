import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { DEFAULT_PORT } from '@pausa/shared';

/**
 * Repo root. Both src/config.ts (dev, tsx) and dist/main.js (bundled) sit three levels below it,
 * so the same relative URL works in either case.
 */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const ConfigInput = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  BIND: z.union([z.ipv4(), z.ipv6(), z.literal('localhost')]).default('127.0.0.1'),
  DATA_DIR: z.string().min(1).default('data'),
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(100).default(10),
  /** Invite redemptions per client IP per minute (SPEC §6.2). Only raised for automated tests. */
  JOIN_RATE_PER_MIN: z.coerce.number().int().min(1).max(10_000).default(5),
  WEB_DIST: z.string().min(1).optional(),
  /** Base delay before a mascot answers, plus up to 1.3 s of jitter. 0 in tests. */
  MASCOT_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(1200),
  /** Chance a mascot reacts to one of its keywords (mentions always get an answer). Tests use 0 or 1. */
  MASCOT_CHANCE: z.coerce.number().min(0).max(1).default(0.35),
  /** Sign-in with the Cloudflare Access email (D-52). Both needed; otherwise invites only. */
  ACCESS_TEAM_DOMAIN: z
    .string()
    .regex(/^[a-z0-9-]+\.cloudflareaccess\.com$/, 'like team-name.cloudflareaccess.com')
    .optional(),
  ACCESS_AUD: z
    .string()
    .regex(/^[a-f0-9]{32,128}$/, 'the Application Audience (AUD) tag')
    .optional(),
  /** Second check on the email domain, on top of the Access policy. */
  ACCESS_EMAIL_DOMAIN: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    .optional(),
  /** The only email that signs in as host. Everyone else is a member. */
  OWNER_EMAIL: z.email().optional(),
});

const KEYS = Object.keys(ConfigInput.shape) as (keyof z.input<typeof ConfigInput>)[];

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  bind: string;
  /** Absolute path. */
  dataDir: string;
  /** Absolute path to the built web app. */
  webDist: string;
  /** e.g. https://abc.trycloudflare.com. Used for invite links and Origin checks (Phase 4+). */
  publicUrl: string | undefined;
  /** Origin derived from publicUrl, or undefined. */
  publicOrigin: string | undefined;
  uploadMaxBytes: number;
  joinRatePerMin: number;
  mascotDelayMs: number;
  mascotChance: number;
  /** Cloudflare Access sign-in (D-52), or null when not configured. */
  access: {
    teamDomain: string;
    aud: string;
    emailDomain: string | null;
    ownerEmail: string | null;
  } | null;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export interface LoadConfigOptions {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Where .env and pausa.config.json are looked up, and what relative paths resolve against. */
  root?: string;
}

/**
 * Precedence: real environment > .env > pausa.config.json (or PAUSA_CONFIG) > defaults.
 * Unknown keys are ignored; invalid values fail fast with a readable message.
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const env = options.env ?? process.env;
  const root = options.root ?? REPO_ROOT;

  const fromJson = readJsonConfig(
    env['PAUSA_CONFIG'] ? resolve(root, env['PAUSA_CONFIG']) : join(root, 'pausa.config.json'),
  );
  const fromDotenv = readDotenv(join(root, '.env'));
  const fromEnv = pick(env);

  const parsed = ConfigInput.safeParse({ ...fromJson, ...fromDotenv, ...fromEnv });
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const c = parsed.data;
  const toAbs = (p: string) => (isAbsolute(p) ? p : resolve(root, p));

  return {
    env: c.NODE_ENV,
    port: c.PORT,
    bind: c.BIND,
    dataDir: toAbs(c.DATA_DIR),
    webDist: c.WEB_DIST ? toAbs(c.WEB_DIST) : resolve(root, 'packages/web/dist'),
    publicUrl: c.PUBLIC_URL,
    publicOrigin: c.PUBLIC_URL ? new URL(c.PUBLIC_URL).origin : undefined,
    uploadMaxBytes: c.UPLOAD_MAX_MB * 1024 * 1024,
    joinRatePerMin: c.JOIN_RATE_PER_MIN,
    mascotDelayMs: c.MASCOT_DELAY_MS,
    mascotChance: c.MASCOT_CHANCE,
    access:
      c.ACCESS_TEAM_DOMAIN && c.ACCESS_AUD
        ? {
            teamDomain: c.ACCESS_TEAM_DOMAIN,
            aud: c.ACCESS_AUD,
            emailDomain: c.ACCESS_EMAIL_DOMAIN?.toLowerCase() ?? null,
            ownerEmail: c.OWNER_EMAIL?.toLowerCase() ?? null,
          }
        : null,
  };
}

function pick(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    const value = source[key];
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

function readDotenv(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return pick(parseEnv(readFileSync(path, 'utf8')));
}

function readJsonConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ConfigError(`Could not parse ${path}: ${(err as Error).message}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ConfigError(`${path} must contain a JSON object`);
  }
  return pick(data as Record<string, unknown>);
}
