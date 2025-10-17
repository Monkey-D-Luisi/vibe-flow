import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resetGithubPrBotConfigCache } from "../src/github/config.js";

const fallbackToken = process.env.PR_TOKEN ?? process.env.GITHUB_TOKEN ?? "test-token";
process.env.PR_TOKEN = fallbackToken;
process.env.GITHUB_TOKEN ??= fallbackToken;

if (!process.env.GITHUB_PR_BOT_CONFIG) {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  process.env.GITHUB_PR_BOT_CONFIG = resolve(currentDir, "../config/github.pr-bot.json");
}

resetGithubPrBotConfigCache();
