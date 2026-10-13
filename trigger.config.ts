import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

const PROD_ENV_FILE = ".env.prod.local";

// Zmienne używane przez taski (środowisko Trigger.dev). Klucze aplikacji Vercel (np. TRIGGER_SECRET_KEY, CRON_SECRET) tu nie trafiają.
const TRIGGER_SECRET_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "GEMINI_API_KEY",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
  "ANTHROPIC_API_KEY",
];
const TRIGGER_PLAIN_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENAI_MODEL",
  "PERPLEXITY_PRESET",
  "GEMINI_MODEL",
  "DATAFORSEO_LOCATION_CODE",
  "ANTHROPIC_SENTIMENT_MODEL",
  "ANTHROPIC_GENERATOR_MODEL",
  "ANTHROPIC_RECOMMENDER_MODEL",
  "ANTHROPIC_WORKSPACE_ID",
];

/** Prosty parser KEY=VALUE: pomija komentarze i puste linie, zdejmuje otaczające cudzysłowy. */
function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadTriggerEnvVars(): Array<{ name: string; value: string; isSecret: boolean }> {
  const file = resolve(process.cwd(), PROD_ENV_FILE);
  if (!existsSync(file)) {
    console.warn(`[trigger.config] Brak pliku ${PROD_ENV_FILE}: zmienne środowiskowe NIE zostaną zsynchronizowane z Trigger.dev (prod).`);
    return [];
  }
  const parsed = parseEnvFile(readFileSync(file, "utf8"));
  const vars: Array<{ name: string; value: string; isSecret: boolean }> = [];
  for (const [names, isSecret] of [
    [TRIGGER_SECRET_VARS, true],
    [TRIGGER_PLAIN_VARS, false],
  ] as const) {
    for (const name of names) {
      const value = parsed[name];
      if (value) vars.push({ name, value, isSecret });
    }
  }
  return vars;
}

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || "proj_replace_me",
  dirs: ["./src/trigger"],
  maxDuration: 900,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 30000, factor: 2, randomize: true },
  },
  build: {
    extensions: [
      // Przy `trigger.dev deploy` wysyła zmienne z .env.prod.local do środowiska prod (nie działa dla `trigger.dev dev`).
      syncEnvVars(({ environment }) => {
        if (environment !== "prod") {
          console.warn(`[trigger.config] Środowisko "${environment}": pomijam synchronizację zmiennych z ${PROD_ENV_FILE} (tylko prod).`);
          return [];
        }
        return loadTriggerEnvVars();
      }),
    ],
  },
});
