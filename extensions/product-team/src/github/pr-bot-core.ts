import { asRecord, asString, extractMetadataLabels, toLabelInput } from './pr-bot-labels.js';
import { resolveReviewers } from './pr-bot-reviewers.js';
import { buildStatusComment, resolveTaskLink } from './pr-bot-comments.js';
import type {
  PrBotAfterToolCallEvent,
  PrBotAutomationDeps,
  PrBotExecutionSummary,
  PrBotHookContext,
  PrCreateResult,
} from './pr-bot-types.js';

function toPrCreateResult(value: unknown): PrCreateResult | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const details = asRecord(root.details);
  const source = details ?? root;
  const numberValue = source.number;
  let prNumber: number;
  if (typeof numberValue === 'number') {
    prNumber = numberValue;
  } else if (typeof numberValue === 'string' && /^\d+$/.test(numberValue.trim())) {
    prNumber = Number(numberValue.trim());
  } else {
    prNumber = Number.NaN;
  }

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return null;
  }

  const url = asString(source.url) ?? undefined;
  return {
    prNumber,
    cached: source.cached === true,
    url,
  };
}

export class PrBotAutomation {
  constructor(private readonly deps: PrBotAutomationDeps) {}

  async handleAfterToolCall(
    event: PrBotAfterToolCallEvent,
    ctx: PrBotHookContext,
  ): Promise<void> {
    if (!this.deps.config.enabled) {
      return;
    }
    if (event.toolName !== 'vcs_pr_create') {
      return;
    }
    if (event.error) {
      return;
    }
    try {
      const params = asRecord(event.params);
      const taskId = asString(params?.taskId);
      if (!taskId) {
        this.deps.logger.warn('pr-bot skipped: missing taskId in vcs.pr.create params');
        return;
      }

      const result = toPrCreateResult(event.result);
      if (!result) {
        this.deps.logger.warn(`pr-bot skipped: invalid vcs.pr.create result for task ${taskId}`);
        return;
      }
      if (result.cached) {
        this.deps.eventLog.logVcsEvent(taskId, 'vcs.pr.bot', ctx.agentId ?? null, {
          prNumber: result.prNumber,
          skipped: true,
          reason: 'cached-pr-create-result',
        });
        return;
      }

      const task = this.deps.taskReader.getById(taskId);
      if (!task) {
        this.deps.logger.warn(`pr-bot skipped: task ${taskId} not found`);
        return;
      }

      const summary: PrBotExecutionSummary = {
        prNumber: result.prNumber,
        cached: false,
        labelsApplied: [],
        reviewersAssigned: [],
        commentPosted: false,
        failures: [],
      };

      const derivedLabels = extractMetadataLabels(task);
      if (derivedLabels.length > 0) {
        try {
          const labelInputs = derivedLabels.map((label) => toLabelInput(label));
          await this.deps.labelService.syncLabels({
            taskId,
            labels: labelInputs,
          });
          await this.deps.prService.updateTaskPr({
            taskId,
            prNumber: result.prNumber,
            labels: derivedLabels,
          });
          summary.labelsApplied = derivedLabels;
        } catch (error: unknown) {
          const message = `labels: ${String(error)}`;
          this.deps.logger.warn(`pr-bot automation failed (${message})`);
          summary.failures.push(message);
        }
      }

      const reviewers = resolveReviewers(task, this.deps.config);
      if (reviewers.length > 0) {
        try {
          await this.deps.ghClient.requestReviewers(result.prNumber, reviewers);
          summary.reviewersAssigned = reviewers;
        } catch (error: unknown) {
          const message = `reviewers: ${String(error)}`;
          this.deps.logger.warn(`pr-bot automation failed (${message})`);
          summary.failures.push(message);
        }
      }

      try {
        const taskLink = resolveTaskLink(
          task,
          this.deps.githubOwner,
          this.deps.githubRepo,
          this.deps.defaultBase,
        );
        const statusComment = buildStatusComment(task, taskLink);
        await this.deps.ghClient.commentPr(result.prNumber, statusComment);
        summary.commentPosted = true;
        summary.taskLink = taskLink;
      } catch (error: unknown) {
        const message = `comment: ${String(error)}`;
        this.deps.logger.warn(`pr-bot automation failed (${message})`);
        summary.failures.push(message);
      }

      this.deps.eventLog.logVcsEvent(taskId, 'vcs.pr.bot', ctx.agentId ?? null, {
        ...summary,
        prUrl: result.url,
      });
      this.deps.logger.info(
        `pr-bot processed PR #${result.prNumber} for task ${taskId} (labels=${summary.labelsApplied.length}, reviewers=${summary.reviewersAssigned.length}, comment=${summary.commentPosted})`,
      );
    } catch (error: unknown) {
      this.deps.logger.warn(`pr-bot hook failed unexpectedly: ${String(error)}`);
    }
  }
}
