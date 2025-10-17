import { PrBotAgent } from '../../services/task-mcp/src/agents/prbot.js'
import { loadGithubPrBotConfig } from '../../services/task-mcp/src/github/config.js'
import type { GithubService, BranchResult, PullRequestResult, LabelsResult, RemoveLabelResult, ProjectStatusResult, ReadyForReviewResult, ReviewersResult, CommentResult } from '../../services/task-mcp/src/github/service.js'
import type { TaskRecord } from '../../services/task-mcp/src/domain/TaskRecord.js'

class FakeGithubService implements GithubService {
  operations: any[] = []

  constructor(private readonly summaryUrl: string) {}

  async createBranch(params: any): Promise<BranchResult> {
    this.operations.push({ tool: 'gh.createBranch', params })
    return { url: `https://example.com/${params.owner}/${params.repo}/tree/${params.name}`, commit: 'fake-sha', created: true }
  }

  async openPullRequest(params: any): Promise<PullRequestResult> {
    this.operations.push({ tool: 'gh.openPR', params })
    return { number: 101, url: this.summaryUrl, draft: params.draft }
  }

  async comment(params: any): Promise<CommentResult> {
    this.operations.push({ tool: 'gh.comment', params })
    return { id: Math.floor(Math.random() * 1000), url: `${this.summaryUrl}#comments` }
  }

  async addLabels(params: any): Promise<LabelsResult> {
    this.operations.push({ tool: 'gh.addLabels', params })
    return { applied: params.labels }
  }

  async removeLabel(params: any): Promise<RemoveLabelResult> {
    this.operations.push({ tool: 'gh.removeLabel', params })
    return { removed: true }
  }

  async setProjectStatus(params: any): Promise<ProjectStatusResult> {
    this.operations.push({ tool: 'gh.setProjectStatus', params })
    return { ok: true }
  }

  async markReadyForReview(params: any): Promise<ReadyForReviewResult> {
    this.operations.push({ tool: 'gh.readyForReview', params })
    return { draft: false, updated: true }
  }

  async requestReviewers(params: any): Promise<ReviewersResult> {
    this.operations.push({ tool: 'gh.requestReviewers', params })
    return { requested: [...(params.reviewers ?? []), ...(params.teamReviewers ?? [])] }
  }
}

function createSampleTask(): TaskRecord {
  const now = new Date().toISOString()
  return {
    id: 'TR-E2EPRBOT1234567890123456',
    title: 'Smoke: PR Bot end-to-end',
    description: 'Sample task for PR Bot smoke test',
    acceptance_criteria: ['Create branch', 'Open draft PR', 'Sync labels'],
    scope: 'minor',
    status: 'pr',
    rev: 0,
    created_at: now,
    updated_at: now,
    tags: ['fast-track', 'fast-track:eligible'],
    metrics: { coverage: 0.83, lint: { errors: 0, warnings: 1 } },
    qa_report: { total: 10, passed: 10, failed: 0 },
    red_green_refactor_log: ['RED: failing test', 'GREEN: implementation', 'REFACTOR: cleanup'],
    links: {
      github: { owner: 'acme', repo: 'project', issueNumber: 77 },
      git: { branch: 'feature/placeholder', prNumber: undefined }
    }
  }
}

async function main() {
  console.log('??  Running PR Bot smoke test (mocked GitHub service)...')

  const config = loadGithubPrBotConfig()
  const fakeService = new FakeGithubService('https://github.com/acme/project/pull/101')
  const agent = new PrBotAgent(fakeService as unknown as GithubService, config)

  const task = createSampleTask()
  const summary = await agent.run(task)

  console.log('\n?  PR Bot summary:')
  console.log(JSON.stringify(summary, null, 2))

  console.log('\n???  GitHub operations executed:')
  for (const op of fakeService.operations) {
    console.log(`- ${op.tool}`, op.params)
  }

  console.log('\n??  Smoke test finished. Review the mocked operations above to verify expected flow.')
}

main().catch((error) => {
  console.error('?  PR Bot smoke test failed:', error)
  process.exit(1)
})
