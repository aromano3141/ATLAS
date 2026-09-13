import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import dotenv from "dotenv";
import { Config, type ConfigT } from "./contracts.ts";
export const dataDir = resolve(
  process.env.REALITY_SYNC_DATA_DIR ||
    join(
      process.env.LOCALAPPDATA || join(homedir(), ".local", "share"),
      "RealitySync",
    ),
);
export const configPath = join(dataDir, "config.json");
export function loadConfig(): ConfigT {
  mkdirSync(dataDir, { recursive: true });
  dotenv.config({ path: join(dataDir, "secrets.env"), quiet: true });
  return Config.parse(
    existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {},
  );
}
export function saveConfig(value: unknown) {
  const config = Config.parse(value);
  Intl.DateTimeFormat("en", { timeZone: config.preferences.timezone });
  if (
    config.jiraBaseUrl &&
    !/^https:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/?$/.test(config.jiraBaseUrl)
  )
    throw new Error("Use your HTTPS tenant.atlassian.net Jira URL.");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(configPath + ".tmp", JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  renameSync(configPath + ".tmp", configPath);
  return config;
}
export function configured() {
  return {
    openai: !!process.env.OPENAI_API_KEY,
    slack: !!process.env.SLACK_BOT_TOKEN,
    slackSocket: !!process.env.SLACK_APP_TOKEN,
    calendar: !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    ),
    jira: !!process.env.JIRA_API_TOKEN,
  };
}
