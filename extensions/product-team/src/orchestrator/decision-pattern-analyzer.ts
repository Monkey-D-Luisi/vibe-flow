import type Database from 'better-sqlite3';
import type { Pattern, PatternReport, Recommendation } from '../schemas/decision-patterns.schema.js';

interface DecisionRow {
  readonly id: string;
  readonly task_ref: string | null;
  readonly agent_id: string;
  readonly category: string;
  readonly question: string;
  readonly decision: string | null;
  readonly reasoning: string | null;
  readonly escalated: number;
  readonly approver: string | null;
  readonly outcome: string | null;
  readonly created_at: string;
}

export interface AnalyzerConfig {
  readonly lastN: number;
  readonly minConfidence: number;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  lastN: 100,
  minConfidence: 0.7,
};

const DECISIONS_TABLE = 'agent_decisions';

/**
 * Rule-based pattern analyzer that reads decision outcome history
 * and detects actionable patterns for policy adjustment.
 *
 * Patterns detected:
 * - escalation_candidate: auto-resolved decisions frequently overridden
 * - auto_candidate: escalated decisions consistently approved with same answer
 * - failure_cluster: agent decisions fail >= 50% in a category
 * - timeout_pattern: decisions consistently time out (re-escalated)
 */
export class DecisionPatternAnalyzer {
  constructor(private readonly db: Database.Database) {}

  analyze(config?: Partial<AnalyzerConfig>): PatternReport {
    const cfg: AnalyzerConfig = { ...DEFAULT_CONFIG, ...config };

    const decisions = this.fetchRecentDecisions(cfg.lastN);

    if (decisions.length === 0) {
      return {
        analyzedDecisions: 0,
        timeRange: { from: '', to: '' },
        patterns: [],
        recommendations: [],
      };
    }

    const timeRange = {
      from: decisions[decisions.length - 1].created_at,
      to: decisions[0].created_at,
    };

    const allPatterns: Pattern[] = [
      ...this.detectEscalationCandidates(decisions),
      ...this.detectAutoCandidates(decisions),
      ...this.detectFailureClusters(decisions),
      ...this.detectTimeoutPatterns(decisions),
    ];

    const filteredPatterns = allPatterns.filter((p) => p.confidence >= cfg.minConfidence);
    const recommendations = this.generateRecommendations(filteredPatterns);

    return {
      analyzedDecisions: decisions.length,
      timeRange,
      patterns: filteredPatterns,
      recommendations,
    };
  }

  private fetchRecentDecisions(limit: number): DecisionRow[] {
    try {
      return this.db.prepare(`
        SELECT id, task_ref, agent_id, category, question, decision, reasoning,
               escalated, approver, outcome, created_at
        FROM ${DECISIONS_TABLE}
        WHERE outcome IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as DecisionRow[];
    } catch {
      return [];
    }
  }

  /**
   * Detect escalation candidates: auto-resolved decisions that were
   * subsequently overridden >= 3 times in the last 10 decisions
   * for a given (category, agent) combo.
   */
  private detectEscalationCandidates(decisions: DecisionRow[]): Pattern[] {
    const patterns: Pattern[] = [];
    const groups = this.groupByCategoryAgent(decisions);

    for (const [key, group] of groups) {
      const [category, agentId] = key.split('::');
      const recent = group.slice(0, 10);
      const autoResolved = recent.filter((d) => d.escalated === 0);
      const overridden = autoResolved.filter((d) => d.outcome === 'overridden');

      if (overridden.length >= 3) {
        const confidence = overridden.length / Math.max(autoResolved.length, 1);
        patterns.push({
          type: 'escalation_candidate',
          agentId,
          category,
          confidence: Math.min(confidence, 1),
          evidence: overridden.map((d) => ({
            decisionId: d.id,
            outcome: d.outcome ?? 'overridden',
          })),
        });
      }
    }

    return patterns;
  }

  /**
   * Detect auto-resolution candidates: escalated decisions where
   * the human/approver consistently approves with the same answer.
   */
  private detectAutoCandidates(decisions: DecisionRow[]): Pattern[] {
    const patterns: Pattern[] = [];
    const groups = this.groupByCategoryAgent(decisions);

    for (const [key, group] of groups) {
      const [category, agentId] = key.split('::');
      const escalated = group.filter((d) => d.escalated === 1 && d.outcome === 'success');

      if (escalated.length < 3) continue;

      const answers = escalated
        .map((d) => d.decision)
        .filter((a): a is string => a !== null);

      if (answers.length === 0) continue;

      const answerCounts = new Map<string, number>();
      for (const answer of answers) {
        answerCounts.set(answer, (answerCounts.get(answer) ?? 0) + 1);
      }

      const [, count] = [...answerCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0];

      const consistency = count / escalated.length;
      if (consistency >= 0.8) {
        patterns.push({
          type: 'auto_candidate',
          agentId,
          category,
          confidence: consistency,
          evidence: escalated.map((d) => ({
            decisionId: d.id,
            outcome: d.outcome ?? 'success',
          })),
        });
      }
    }

    return patterns;
  }

  /**
   * Detect failure clusters: agent decisions fail >= 50% in a category.
   */
  private detectFailureClusters(decisions: DecisionRow[]): Pattern[] {
    const patterns: Pattern[] = [];
    const groups = this.groupByCategoryAgent(decisions);

    for (const [key, group] of groups) {
      const [category, agentId] = key.split('::');
      if (group.length < 4) continue;

      const failures = group.filter((d) => d.outcome === 'failed');
      const failureRate = failures.length / group.length;

      if (failureRate >= 0.5) {
        patterns.push({
          type: 'failure_cluster',
          agentId,
          category,
          confidence: failureRate,
          evidence: failures.map((d) => ({
            decisionId: d.id,
            outcome: d.outcome ?? 'failed',
          })),
        });
      }
    }

    return patterns;
  }

  /**
   * Detect timeout patterns: decisions that are re-escalated (indicating
   * the original decision timed out). Identified by reasoning containing
   * 'timed_out' or 'timeout' keywords, or re-escalation evidence.
   */
  private detectTimeoutPatterns(decisions: DecisionRow[]): Pattern[] {
    const patterns: Pattern[] = [];
    const groups = this.groupByCategoryAgent(decisions);

    for (const [key, group] of groups) {
      const [category, agentId] = key.split('::');
      if (group.length < 3) continue;

      const timeouts = group.filter((d) => {
        const reasoning = (d.reasoning ?? '').toLowerCase();
        return reasoning.includes('timed_out') ||
          reasoning.includes('timeout') ||
          reasoning.includes('re-escalat');
      });

      if (timeouts.length < 2) continue;

      const timeoutRate = timeouts.length / group.length;
      if (timeoutRate >= 0.3) {
        patterns.push({
          type: 'timeout_pattern',
          agentId,
          category,
          confidence: timeoutRate,
          evidence: timeouts.map((d) => ({
            decisionId: d.id,
            outcome: d.outcome ?? 'failed',
          })),
        });
      }
    }

    return patterns;
  }

  /**
   * Group decisions by "category::agentId" for per-combo analysis.
   * Within each group, decisions are ordered most-recent first.
   */
  private groupByCategoryAgent(decisions: DecisionRow[]): Map<string, DecisionRow[]> {
    const groups = new Map<string, DecisionRow[]>();
    for (const d of decisions) {
      const key = `${d.category}::${d.agent_id}`;
      const list = groups.get(key) ?? [];
      list.push(d);
      groups.set(key, list);
    }
    return groups;
  }

  private generateRecommendations(patterns: Pattern[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'escalation_candidate':
          recommendations.push({
            patternType: 'escalation_candidate',
            action: 'change_policy',
            details: {
              category: pattern.category,
              agentId: pattern.agentId,
              newPolicy: 'escalate',
              reason: `${pattern.evidence.length} auto-resolved decisions were overridden`,
            },
            confidence: pattern.confidence,
          });
          break;

        case 'auto_candidate':
          recommendations.push({
            patternType: 'auto_candidate',
            action: 'change_policy',
            details: {
              category: pattern.category,
              agentId: pattern.agentId,
              newPolicy: 'auto',
              reason: `${pattern.evidence.length} escalated decisions consistently approved`,
            },
            confidence: pattern.confidence,
          });
          break;

        case 'failure_cluster':
          recommendations.push({
            patternType: 'failure_cluster',
            action: 'alert_human',
            details: {
              category: pattern.category,
              agentId: pattern.agentId,
              failureCount: pattern.evidence.length,
              reason: `>= 50% failure rate detected for ${pattern.agentId} in ${pattern.category}`,
            },
            confidence: pattern.confidence,
          });
          break;

        case 'timeout_pattern':
          recommendations.push({
            patternType: 'timeout_pattern',
            action: 'adjust_timeout',
            details: {
              category: pattern.category,
              agentId: pattern.agentId,
              timeoutCount: pattern.evidence.length,
              reason: `Consistent timeouts detected for ${pattern.agentId} in ${pattern.category}`,
            },
            confidence: pattern.confidence,
          });
          break;
      }
    }

    return recommendations;
  }
}
