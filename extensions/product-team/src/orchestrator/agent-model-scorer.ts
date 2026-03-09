import type Database from 'better-sqlite3';

export interface AgentModelScore {
  readonly agentId: string;
  readonly modelId: string;
  readonly taskType: string;
  readonly sampleSize: number;
  readonly score: number;
  readonly dimensions: {
    readonly successRate: number;
    readonly qualityScore: number;
    readonly tokenEfficiency: number;
    readonly durationEfficiency: number;
  };
  readonly trend: 'improving' | 'stable' | 'degrading';
  readonly lastUpdated: string;
}

export interface ModelRecommendation {
  readonly agentId: string;
  readonly taskType: string;
  readonly recommendedModelId: string;
  readonly score: number;
  readonly sampleSize: number;
  readonly confidence: number;
}

export interface ScorerConfig {
  readonly minSampleSize: number;
  readonly weights: {
    readonly successRate: number;
    readonly qualityScore: number;
    readonly tokenEfficiency: number;
    readonly durationEfficiency: number;
  };
}

const DEFAULT_CONFIG: ScorerConfig = {
  minSampleSize: 5,
  weights: {
    successRate: 0.4,
    qualityScore: 0.25,
    tokenEfficiency: 0.2,
    durationEfficiency: 0.15,
  },
};

const SCORES_TABLE = 'agent_model_scores';

interface CostRow {
  agent_id: string;
  task_id: string;
  payload: string;
}

interface DecisionOutcomeRow {
  agent_id: string;
  outcome: string;
}

interface ScoreRow {
  id: string;
  agent_id: string;
  model_id: string;
  task_type: string;
  sample_size: number;
  score: number;
  success_rate: number;
  quality_score: number;
  token_efficiency: number;
  duration_efficiency: number;
  trend: string;
  created_at: string;
  updated_at: string;
}

/**
 * Scores the effectiveness of each agent x model combination across
 * different task types (pipeline stages), using event log data.
 *
 * Scoring dimensions:
 * - Success rate (40%): decision outcomes success vs total
 * - Quality score (25%): quality gate pass rate from events
 * - Token efficiency (20%): tokens consumed vs stage median
 * - Duration efficiency (15%): time spent vs stage median
 */
export class AgentModelScorer {
  private readonly config: ScorerConfig;

  constructor(
    private readonly db: Database.Database,
    private readonly generateId: () => string,
    private readonly now: () => string,
    config?: Partial<ScorerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureTable();
  }

  /**
   * Compute and store scores for all agent x model combinations.
   * Returns newly computed scores.
   */
  computeScores(): AgentModelScore[] {
    const agentModelPairs = this.discoverAgentModelPairs();
    const scores: AgentModelScore[] = [];

    for (const { agentId, modelId, taskType } of agentModelPairs) {
      const dims = this.computeDimensions(agentId, modelId, taskType);
      if (dims.sampleSize < this.config.minSampleSize) continue;

      const composite = this.computeComposite(dims);
      const trend = this.computeTrend(agentId, modelId, taskType, composite);
      const now = this.now();

      const score: AgentModelScore = {
        agentId,
        modelId,
        taskType,
        sampleSize: dims.sampleSize,
        score: composite,
        dimensions: {
          successRate: dims.successRate,
          qualityScore: dims.qualityScore,
          tokenEfficiency: dims.tokenEfficiency,
          durationEfficiency: dims.durationEfficiency,
        },
        trend,
        lastUpdated: now,
      };

      this.upsertScore(score);
      scores.push(score);
    }

    return scores;
  }

  /**
   * Get the best model recommendation for a given agent and task type.
   * Returns null if insufficient data.
   */
  getBestModel(agentId: string, taskType: string): ModelRecommendation | null {
    const rows = this.db.prepare(`
      SELECT * FROM ${SCORES_TABLE}
      WHERE agent_id = ? AND task_type = ? AND sample_size >= ?
      ORDER BY score DESC
      LIMIT 1
    `).all(agentId, taskType, this.config.minSampleSize) as ScoreRow[];

    if (rows.length === 0) return null;

    const row = rows[0];
    const confidence = Math.min(row.sample_size / 20, 1.0);

    return {
      agentId: row.agent_id,
      taskType: row.task_type,
      recommendedModelId: row.model_id,
      score: row.score,
      sampleSize: row.sample_size,
      confidence,
    };
  }

  /**
   * Get all stored scores.
   */
  getAllScores(): AgentModelScore[] {
    const rows = this.db.prepare(`
      SELECT * FROM ${SCORES_TABLE}
      ORDER BY agent_id, task_type, score DESC
    `).all() as ScoreRow[];

    return rows.map(this.rowToScore);
  }

  /**
   * Get scores for a specific agent.
   */
  getScoresByAgent(agentId: string): AgentModelScore[] {
    const rows = this.db.prepare(`
      SELECT * FROM ${SCORES_TABLE}
      WHERE agent_id = ?
      ORDER BY task_type, score DESC
    `).all(agentId) as ScoreRow[];

    return rows.map(this.rowToScore);
  }

  private discoverAgentModelPairs(): Array<{
    agentId: string;
    modelId: string;
    taskType: string;
  }> {
    try {
      const rows = this.db.prepare(`
        SELECT DISTINCT
          e.agent_id,
          json_extract(e.payload, '$.model') as model_id,
          json_extract(e.payload, '$.stepId') as task_type
        FROM event_log e
        WHERE e.event_type = 'cost.llm'
          AND e.agent_id IS NOT NULL
          AND json_extract(e.payload, '$.model') IS NOT NULL
      `).all() as Array<{ agent_id: string; model_id: string; task_type: string | null }>;

      return rows
        .filter((r) => r.model_id)
        .map((r) => ({
          agentId: r.agent_id,
          modelId: r.model_id,
          taskType: r.task_type ?? 'general',
        }));
    } catch {
      return [];
    }
  }

  private computeDimensions(
    agentId: string,
    modelId: string,
    taskType: string,
  ): {
    sampleSize: number;
    successRate: number;
    qualityScore: number;
    tokenEfficiency: number;
    durationEfficiency: number;
  } {
    const successRate = this.computeSuccessRate(agentId);
    const qualityScore = this.computeQualityScore(agentId);
    const { efficiency: tokenEfficiency, sampleSize: tokenSamples } =
      this.computeTokenEfficiency(agentId, modelId, taskType);
    const durationEfficiency = this.computeDurationEfficiency(agentId);

    return {
      sampleSize: tokenSamples,
      successRate,
      qualityScore,
      tokenEfficiency,
      durationEfficiency,
    };
  }

  private computeSuccessRate(agentId: string): number {
    try {
      const rows = this.db.prepare(`
        SELECT outcome FROM agent_decisions
        WHERE agent_id = ? AND outcome IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 50
      `).all(agentId) as DecisionOutcomeRow[];

      if (rows.length === 0) return 50;

      const successes = rows.filter((r) => r.outcome === 'success').length;
      return Math.round((successes / rows.length) * 100);
    } catch {
      return 50;
    }
  }

  private computeQualityScore(agentId: string): number {
    try {
      const rows = this.db.prepare(`
        SELECT payload FROM event_log
        WHERE agent_id = ? AND event_type LIKE 'quality.%'
        ORDER BY created_at DESC
        LIMIT 20
      `).all(agentId) as Array<{ payload: string }>;

      if (rows.length === 0) return 50;

      let passes = 0;
      for (const row of rows) {
        const payload = JSON.parse(row.payload) as Record<string, unknown>;
        if (payload.passed === true || payload.pass === true || payload.status === 'pass') {
          passes++;
        }
      }

      return Math.round((passes / rows.length) * 100);
    } catch {
      return 50;
    }
  }

  private computeTokenEfficiency(
    agentId: string,
    modelId: string,
    taskType: string,
  ): { efficiency: number; sampleSize: number } {
    try {
      const agentRows = this.db.prepare(`
        SELECT payload FROM event_log
        WHERE agent_id = ? AND event_type = 'cost.llm'
          AND json_extract(payload, '$.model') = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(agentId, modelId) as CostRow[];

      if (agentRows.length === 0) return { efficiency: 50, sampleSize: 0 };

      const agentTokens = agentRows.map((r) => {
        const p = JSON.parse(r.payload) as { inputTokens?: number; outputTokens?: number };
        return (p.inputTokens ?? 0) + (p.outputTokens ?? 0);
      });
      const agentAvg = agentTokens.reduce((a, b) => a + b, 0) / agentTokens.length;

      const medianRows = this.db.prepare(`
        SELECT payload FROM event_log
        WHERE event_type = 'cost.llm'
          AND json_extract(payload, '$.stepId') = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(taskType) as CostRow[];

      if (medianRows.length === 0) return { efficiency: 50, sampleSize: agentRows.length };

      const allTokens = medianRows.map((r) => {
        const p = JSON.parse(r.payload) as { inputTokens?: number; outputTokens?: number };
        return (p.inputTokens ?? 0) + (p.outputTokens ?? 0);
      });
      const sorted = allTokens.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      if (median === 0) return { efficiency: 50, sampleSize: agentRows.length };

      const ratio = agentAvg / median;
      const efficiency = Math.max(0, Math.min(100, Math.round(100 * (2 - ratio))));

      return { efficiency, sampleSize: agentRows.length };
    } catch {
      return { efficiency: 50, sampleSize: 0 };
    }
  }

  private computeDurationEfficiency(agentId: string): number {
    try {
      const agentRows = this.db.prepare(`
        SELECT payload FROM event_log
        WHERE agent_id = ? AND event_type = 'cost.llm'
        ORDER BY created_at DESC
        LIMIT 50
      `).all(agentId) as Array<{ payload: string }>;

      if (agentRows.length === 0) return 50;

      const agentDurations = agentRows.map((r) => {
        const p = JSON.parse(r.payload) as { durationMs?: number };
        return p.durationMs ?? 0;
      }).filter((d) => d > 0);

      if (agentDurations.length === 0) return 50;

      const agentAvg = agentDurations.reduce((a, b) => a + b, 0) / agentDurations.length;

      const allRows = this.db.prepare(`
        SELECT payload FROM event_log
        WHERE event_type = 'cost.llm'
        ORDER BY created_at DESC
        LIMIT 200
      `).all() as Array<{ payload: string }>;

      const allDurations = allRows.map((r) => {
        const p = JSON.parse(r.payload) as { durationMs?: number };
        return p.durationMs ?? 0;
      }).filter((d) => d > 0);

      if (allDurations.length === 0) return 50;

      const sorted = allDurations.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      if (median === 0) return 50;

      const ratio = agentAvg / median;
      return Math.max(0, Math.min(100, Math.round(100 * (2 - ratio))));
    } catch {
      return 50;
    }
  }

  private computeComposite(dims: {
    successRate: number;
    qualityScore: number;
    tokenEfficiency: number;
    durationEfficiency: number;
  }): number {
    const { weights } = this.config;
    const raw =
      dims.successRate * weights.successRate +
      dims.qualityScore * weights.qualityScore +
      dims.tokenEfficiency * weights.tokenEfficiency +
      dims.durationEfficiency * weights.durationEfficiency;
    return Math.round(raw * 10) / 10;
  }

  private computeTrend(
    agentId: string,
    modelId: string,
    taskType: string,
    currentScore: number,
  ): 'improving' | 'stable' | 'degrading' {
    const rows = this.db.prepare(`
      SELECT score FROM ${SCORES_TABLE}
      WHERE agent_id = ? AND model_id = ? AND task_type = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).all(agentId, modelId, taskType) as Array<{ score: number }>;

    if (rows.length === 0) return 'stable';

    const previous = rows[0].score;
    const delta = currentScore - previous;

    if (delta > 5) return 'improving';
    if (delta < -5) return 'degrading';
    return 'stable';
  }

  private upsertScore(score: AgentModelScore): void {
    const existing = this.db.prepare(`
      SELECT id FROM ${SCORES_TABLE}
      WHERE agent_id = ? AND model_id = ? AND task_type = ?
    `).get(score.agentId, score.modelId, score.taskType) as { id: string } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE ${SCORES_TABLE}
        SET sample_size = ?, score = ?, success_rate = ?, quality_score = ?,
            token_efficiency = ?, duration_efficiency = ?, trend = ?, updated_at = ?
        WHERE id = ?
      `).run(
        score.sampleSize, score.score,
        score.dimensions.successRate, score.dimensions.qualityScore,
        score.dimensions.tokenEfficiency, score.dimensions.durationEfficiency,
        score.trend, score.lastUpdated, existing.id,
      );
    } else {
      const id = this.generateId();
      this.db.prepare(`
        INSERT INTO ${SCORES_TABLE}
          (id, agent_id, model_id, task_type, sample_size, score,
           success_rate, quality_score, token_efficiency, duration_efficiency,
           trend, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, score.agentId, score.modelId, score.taskType,
        score.sampleSize, score.score,
        score.dimensions.successRate, score.dimensions.qualityScore,
        score.dimensions.tokenEfficiency, score.dimensions.durationEfficiency,
        score.trend, score.lastUpdated, score.lastUpdated,
      );
    }
  }

  private rowToScore(row: ScoreRow): AgentModelScore {
    return {
      agentId: row.agent_id,
      modelId: row.model_id,
      taskType: row.task_type,
      sampleSize: row.sample_size,
      score: row.score,
      dimensions: {
        successRate: row.success_rate,
        qualityScore: row.quality_score,
        tokenEfficiency: row.token_efficiency,
        durationEfficiency: row.duration_efficiency,
      },
      trend: row.trend as 'improving' | 'stable' | 'degrading',
      lastUpdated: row.updated_at,
    };
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${SCORES_TABLE} (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        sample_size INTEGER NOT NULL,
        score REAL NOT NULL,
        success_rate REAL NOT NULL,
        quality_score REAL NOT NULL,
        token_efficiency REAL NOT NULL,
        duration_efficiency REAL NOT NULL,
        trend TEXT NOT NULL DEFAULT 'stable',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, model_id, task_type)
      )
    `);
  }
}
