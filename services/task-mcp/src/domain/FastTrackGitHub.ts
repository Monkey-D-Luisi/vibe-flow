import { evaluateFastTrack, guardPostDev, FastTrackContext, FastTrackResult, PostDevGuardResult } from './FastTrack.js';
import { TaskRecord } from './TaskRecord.js';

/**
 * GitHub automation for fast-track tasks
 */
export class FastTrackGitHub {
  constructor(
    private openPR: (args: { title: string; head: string; base: string; body: string; draft: boolean; labels: string[] }) => Promise<any>,
    private addLabels: (args: { number: number; labels: string[]; type?: string }) => Promise<any>,
    private comment: (args: { number: number; body: string; type?: string }) => Promise<any>
  ) {}

  /**
   * Automate GitHub actions when fast-track is evaluated
   */
  async onFastTrackEvaluated(task: TaskRecord, result: FastTrackResult, prNumber?: number): Promise<void> {
    if (!prNumber) return;

    const labels = this.getLabelsForEvaluation(result);
    if (labels.length > 0) {
      await this.addLabels({ number: prNumber, labels, type: 'pr' });
    }

    const commentBody = this.buildEvaluationComment(task, result);
    await this.comment({ number: prNumber, body: commentBody, type: 'pr' });
  }

  /**
   * Automate GitHub actions when fast-track is revoked post-DEV
   */
  async onFastTrackRevoked(task: TaskRecord, guardResult: PostDevGuardResult, prNumber?: number): Promise<void> {
    if (!prNumber || !guardResult.revoke) return;

    // Add revoked label
    await this.addLabels({ number: prNumber, labels: ['fast-track:revoked'], type: 'pr' });

    // Remove eligible label if present
    // Note: GitHub API doesn't have direct remove labels, but we can add a comment

    const commentBody = this.buildRevocationComment(task, guardResult);
    await this.comment({ number: prNumber, body: commentBody, type: 'pr' });
  }

  /**
   * Ensure PR is created as draft for fast-track eligible tasks
   */
  async createFastTrackPR(task: TaskRecord, result: FastTrackResult, branchName: string, base = 'main'): Promise<any> {
    const labels = this.getLabelsForEvaluation(result);
    const body = this.buildPREvaluationBody(task, result);

    return await this.openPR({
      title: `${task.title} [FAST-TRACK]`,
      head: branchName,
      base,
      body,
      draft: result.eligible, // Draft if eligible for fast-track
      labels
    });
  }

  private getLabelsForEvaluation(result: FastTrackResult): string[] {
    const labels: string[] = [];

    if (result.eligible) {
      labels.push('fast-track', 'fast-track:eligible');
    } else {
      labels.push('fast-track:incompatible');
      if (result.hardBlocks.length > 0) {
        labels.push('fast-track:blocked');
      }
    }

    return labels;
  }

  private buildEvaluationComment(task: TaskRecord, result: FastTrackResult): string {
    let comment = '## 🚀 Fast-Track Evaluation\n\n';
    comment += `**Task:** ${task.title} (${task.id})\n`;
    comment += `**Scope:** ${task.scope}\n`;
    comment += `**Eligible:** ${result.eligible ? '✅ Yes' : '❌ No'}\n`;
    comment += `**Score:** ${result.score}/100\n\n`;

    if (result.reasons.length > 0) {
      comment += '**Reasons:**\n';
      result.reasons.forEach(reason => {
        comment += `- ${this.formatReason(reason)}\n`;
      });
      comment += '\n';
    }

    if (result.hardBlocks.length > 0) {
      comment += '**🚫 Hard Blocks:**\n';
      result.hardBlocks.forEach(block => {
        comment += `- ${this.formatHardBlock(block)}\n`;
      });
      comment += '\n';
    }

    if (result.eligible) {
      comment += '🎉 **Fast-track approved!** This task will skip the Architecture phase and go directly to Development.\n\n';
      comment += '*Quality gates will be re-evaluated after development completion.*';
    } else {
      comment += '📋 This task requires full Architecture review before proceeding to Development.';
    }

    return comment;
  }

  private buildRevocationComment(task: TaskRecord, guardResult: PostDevGuardResult): string {
    let comment = '## ⚠️ Fast-Track Revoked\n\n';
    comment += `**Task:** ${task.title} (${task.id})\n`;
    comment += `**Reason:** ${this.formatRevocationReason(guardResult.reason!)}\n\n`;

    comment += 'This task must now go through the standard Architecture review process.\n\n';
    comment += '*The fast-track status has been revoked due to quality gate violations.*';

    return comment;
  }

  private buildPREvaluationBody(task: TaskRecord, result: FastTrackResult): string {
    let body = `## ${task.title}\n\n`;
    body += `**Task ID:** ${task.id}\n`;
    body += `**Scope:** ${task.scope}\n\n`;

    if (result.eligible) {
      body += '## 🚀 Fast-Track Eligible\n\n';
      body += 'This task has been evaluated as eligible for fast-track processing, skipping the Architecture phase.\n\n';
      body += `**Fast-Track Score:** ${result.score}/100\n\n`;
    } else {
      body += '## 📋 Standard Process Required\n\n';
      body += 'This task requires standard Architecture review before proceeding.\n\n';
      if (result.hardBlocks.length > 0) {
        body += '**Blocking Issues:**\n';
        result.hardBlocks.forEach(block => {
          body += `- ${this.formatHardBlock(block)}\n`;
        });
      }
    }

    body += `**Acceptance Criteria:**\n${task.acceptance_criteria.map(c => `- ${c}`).join('\n')}\n`;

    return body;
  }

  private formatReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      'scope_minor': 'Minor scope task',
      'only_tests_docs': 'Tests and documentation only',
      'diff_small': 'Small diff size',
      'diff_medium': 'Medium diff size',
      'complexity_ok': 'Good code complexity',
      'no_modules_changed': 'No module changes',
      'eligible': 'Meets all criteria'
    };
    return reasonMap[reason] || reason;
  }

  private formatHardBlock(block: string): string {
    const blockMap: Record<string, string> = {
      'public_api': 'Public API changes detected',
      'modules_changed': 'Module boundaries changed',
      'sensitive_path': 'Changes to sensitive paths (security/auth/payments/infra/migrations)',
      'schema_change': 'Schema files modified',
      'contracts_touched': 'Contract modifications',
      'adr_required': 'ADR required for this change',
      'lint_errors': 'Lint errors present'
    };
    return blockMap[block] || block;
  }

  private formatRevocationReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      'public_api': 'Public API changes detected post-development',
      'modules_changed': 'Module boundaries changed',
      'sensitive_path': 'Changes to sensitive paths',
      'schema_change': 'Schema modifications',
      'contracts_touched': 'Contract changes',
      'adr_required': 'ADR requirement identified',
      'lint_errors': 'Lint errors present',
      'coverage_below_threshold': 'Test coverage below required threshold',
      'high_violations': 'High-severity violations detected',
      'score_below_threshold': 'Fast-track score below threshold'
    };
    return reasonMap[reason] || reason;
  }
}