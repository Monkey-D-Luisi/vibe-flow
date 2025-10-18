import fs from 'node:fs';
import process from 'node:process';
import { repo, githubRequestRepo } from '../src/mcp/tools/handlers/sharedRepos.js';
import { rowToRecord } from '../src/repo/row-mapper.js';
import { createGithubService } from '../src/github/service.js';
import { loadGithubPrBotConfig } from '../src/github/config.js';
import { PrBotAgent } from '../src/agents/prbot.js';
import { createOctokit } from '../src/github/octokit.js';

async function countApprovals(octokit, owner, repoName, prNumber) {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo: repoName,
    pull_number: prNumber,
    per_page: 100
  });

  const latestStateByUser = new Map();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login) continue;
    const state = (review.state ?? '').toUpperCase();
    latestStateByUser.set(login, state);
  }

  let approvals = 0;
  for (const state of latestStateByUser.values()) {
    if (state === 'APPROVED') {
      approvals += 1;
    }
  }
  return approvals;
}

async function checksGreen(octokit, owner, repoName, sha, requiredNames = []) {
  if (!requiredNames.length) {
    return false;
  }

  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo: repoName,
    ref: sha,
    per_page: 100
  });

  const successful = new Set();
  for (const run of data.check_runs ?? []) {
    if (!run?.name) continue;
    if (!requiredNames.includes(run.name)) continue;
    if (run.status === 'completed' && run.conclusion === 'success') {
      successful.add(run.name);
    }
  }

  return requiredNames.every((name) => successful.has(name));
}

function qaReportPassed(task) {
  const report = task.qa_report;
  if (!report) return false;
  if (typeof report.total !== 'number' || typeof report.failed !== 'number') {
    return false;
  }
  return report.total > 0 && report.failed === 0;
}

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
  const octokit = createOctokit();
  const pull = await octokit.rest.pulls.get({ owner, repo: repoName, pull_number: prNumber });

  let approvalsCount = 0;
  if (config.ready?.requireReviewApproval) {
    approvalsCount = await countApprovals(octokit, owner, repoName, prNumber);
  }

  let qaChecksPassed = false;
  const qaReportOk = qaReportPassed(task);
  if (config.ready?.requireQaPass && !qaReportOk) {
    const qaNames = config.checks?.qaWorkflowNames ?? [];
    if (qaNames.length > 0) {
      qaChecksPassed = await checksGreen(octokit, owner, repoName, pull.data.head.sha, qaNames);
    }
  }

  const githubService = createGithubService({ requests: githubRequestRepo, config });
  const agent = new PrBotAgent(githubService, config);

  const summary = await agent.run(task, {
    approvalsCount,
    qaReportPassed: qaReportOk,
    qaChecksPassed
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('PR-Bot sync failed:', error);
  process.exit(1);
});
