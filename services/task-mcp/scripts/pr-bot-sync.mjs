import fs from 'node:fs';
import process from 'node:process';
import { repo, githubRequestRepo } from '../src/mcp/tools/handlers/sharedRepos.js';
import { rowToRecord } from '../src/repo/row-mapper.js';
import { createGithubService } from '../src/github/service.js';
import { loadGithubPrBotConfig } from '../src/github/config.js';
import { PrBotAgent } from '../src/agents/prbot.js';

function extractEventInfo(event) {
  if (!event) {
    return {};
  }

  if (event.pull_request) {
    return {
      owner: event.repository?.owner?.login,
      repo: event.repository?.name,
      prNumber: event.pull_request.number
    };
  }

  if (event.workflow_run && Array.isArray(event.workflow_run.pull_requests) && event.workflow_run.pull_requests.length > 0) {
    const pr = event.workflow_run.pull_requests[0];
    const repository = event.repository ?? event.workflow_run.repository;
    return {
      owner: repository?.owner?.login,
      repo: repository?.name,
      prNumber: pr.number
    };
  }

  return {};
}

async function main() {
  const [eventPath] = process.argv.slice(2);
  if (!eventPath) {
    console.error('Usage: node pr-bot-sync.mjs <github_event_path>');
    process.exit(1);
  }

  if (!fs.existsSync(eventPath)) {
    console.error(`GitHub event file not found: ${eventPath}`);
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const { owner, repo: repoName, prNumber } = extractEventInfo(event);

  if (!prNumber || !owner || !repoName) {
    console.warn('PR-Bot sync: event payload missing owner/repo/pr info. Skipping.');
    return;
  }

  const row = repo.database
    .prepare("SELECT * FROM task_records WHERE json_extract(links_json, '$.git.prNumber') = ?")
    .get(prNumber);

  if (!row) {
    console.warn(`PR-Bot sync: TaskRecord not found for PR #${prNumber}.`);
    return;
  }

  const task = rowToRecord(row);
  task.links = task.links ?? {};
  task.links.github = {
    owner,
    repo: repoName,
    ...(task.links.github ?? {})
  };

  const config = loadGithubPrBotConfig();
  const githubService = createGithubService({ requests: githubRequestRepo, config });
  const agent = new PrBotAgent(githubService, config);

  const summary = await agent.run(task);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('PR-Bot sync failed:', error);
  process.exit(1);
});
