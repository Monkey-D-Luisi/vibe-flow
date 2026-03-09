import type Database from 'better-sqlite3';

export interface OutputTemplate {
  readonly id: string;
  readonly agentId: string;
  readonly stage: string;
  readonly schemaKey: string;
  readonly skeleton: string;
  readonly sampleCount: number;
  readonly matchRatio: number;
  readonly version: number;
  readonly lastUsedRun: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface EventPayloadRow {
  payload: string;
  task_id: string;
}

interface TemplateRow {
  id: string;
  agent_id: string;
  stage: string;
  schema_key: string;
  skeleton: string;
  sample_count: number;
  match_ratio: number;
  version: number;
  last_used_run: number;
  created_at: string;
  updated_at: string;
}

export interface DetectorConfig {
  readonly matchThreshold: number;
  readonly minSamples: number;
  readonly expiryRuns: number;
  readonly lastN: number;
}

const DEFAULT_CONFIG: DetectorConfig = {
  matchThreshold: 0.8,
  minSamples: 5,
  expiryRuns: 20,
  lastN: 20,
};

const TEMPLATES_TABLE = 'output_templates';

/**
 * Detects recurring output structures from agent workflow step outputs
 * and creates reusable templates to reduce token consumption.
 *
 * Detection algorithm:
 * 1. For each (agentId, stage, schema) combo, collect last N outputs
 * 2. Extract structural skeleton (keys and types, not values)
 * 3. If >= 80% share the same skeleton, create/update template
 * 4. Templates expire after 20 pipeline runs without use
 */
export class TemplateDetector {
  private readonly config: DetectorConfig;

  constructor(
    private readonly db: Database.Database,
    private readonly generateId: () => string,
    private readonly now: () => string,
    config?: Partial<DetectorConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureTable();
  }

  /**
   * Detect templates from recent workflow step outputs.
   * Returns newly created/updated templates.
   */
  detectTemplates(): OutputTemplate[] {
    const combos = this.discoverCombinations();
    const results: OutputTemplate[] = [];

    for (const { agentId, stage, schemaKey } of combos) {
      const outputs = this.fetchOutputs(agentId, stage, schemaKey);
      if (outputs.length < this.config.minSamples) continue;

      const skeletons = outputs.map(extractSkeleton);
      const dominantSkeleton = findDominantSkeleton(skeletons, this.config.matchThreshold);
      if (!dominantSkeleton) continue;

      const matchCount = skeletons.filter((s) => s === dominantSkeleton.skeleton).length;
      const matchRatio = matchCount / skeletons.length;

      const template = this.upsertTemplate({
        agentId,
        stage,
        schemaKey,
        skeleton: dominantSkeleton.skeleton,
        sampleCount: outputs.length,
        matchRatio,
      });

      if (template) results.push(template);
    }

    return results;
  }

  /**
   * Get a template for a given (agentId, stage, schemaKey) combo.
   * Returns null if no template exists.
   */
  getTemplate(agentId: string, stage: string, schemaKey: string): OutputTemplate | null {
    const row = this.db.prepare(`
      SELECT * FROM ${TEMPLATES_TABLE}
      WHERE agent_id = ? AND stage = ? AND schema_key = ?
    `).get(agentId, stage, schemaKey) as TemplateRow | undefined;

    return row ? this.rowToTemplate(row) : null;
  }

  /**
   * Mark a template as used in a pipeline run.
   */
  markUsed(templateId: string, pipelineRun: number): void {
    this.db.prepare(`
      UPDATE ${TEMPLATES_TABLE}
      SET last_used_run = ?, updated_at = ?
      WHERE id = ?
    `).run(pipelineRun, this.now(), templateId);
  }

  /**
   * Expire templates not used in the last N pipeline runs.
   * Returns the IDs of expired templates.
   */
  expireStale(currentPipelineRun: number): string[] {
    const threshold = currentPipelineRun - this.config.expiryRuns;
    const rows = this.db.prepare(`
      SELECT id FROM ${TEMPLATES_TABLE}
      WHERE last_used_run < ?
    `).all(threshold) as Array<{ id: string }>;

    if (rows.length > 0) {
      this.db.prepare(`
        DELETE FROM ${TEMPLATES_TABLE}
        WHERE last_used_run < ?
      `).run(threshold);
    }

    return rows.map((r) => r.id);
  }

  /**
   * Get all active templates.
   */
  getAllTemplates(): OutputTemplate[] {
    const rows = this.db.prepare(`
      SELECT * FROM ${TEMPLATES_TABLE}
      ORDER BY agent_id, stage, schema_key
    `).all() as TemplateRow[];

    return rows.map(this.rowToTemplate);
  }

  /**
   * Format a template as a prompt prefix.
   */
  formatAsPromptPrefix(template: OutputTemplate): string {
    return [
      'Based on prior successful outputs, start with this structure:',
      '```json',
      template.skeleton,
      '```',
      `(Template v${template.version}, ${template.sampleCount} samples, ${Math.round(template.matchRatio * 100)}% match rate)`,
    ].join('\n');
  }

  private discoverCombinations(): Array<{
    agentId: string;
    stage: string;
    schemaKey: string;
  }> {
    try {
      const rows = this.db.prepare(`
        SELECT DISTINCT
          agent_id,
          json_extract(payload, '$.stepType') as stage,
          json_extract(payload, '$.schemaKey') as schema_key
        FROM event_log
        WHERE event_type = 'workflow.step.completed'
          AND agent_id IS NOT NULL
          AND json_extract(payload, '$.schemaKey') IS NOT NULL
      `).all() as Array<{
        agent_id: string;
        stage: string | null;
        schema_key: string | null;
      }>;

      return rows
        .filter((r) => r.stage && r.schema_key)
        .map((r) => ({
          agentId: r.agent_id,
          stage: r.stage!,
          schemaKey: r.schema_key!,
        }));
    } catch {
      return [];
    }
  }

  private fetchOutputs(
    agentId: string,
    stage: string,
    schemaKey: string,
  ): string[] {
    try {
      const rows = this.db.prepare(`
        SELECT payload, task_id FROM event_log
        WHERE event_type = 'workflow.step.completed'
          AND agent_id = ?
          AND json_extract(payload, '$.stepType') = ?
          AND json_extract(payload, '$.schemaKey') = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(agentId, stage, schemaKey, this.config.lastN) as EventPayloadRow[];

      return rows.map((r) => r.payload);
    } catch {
      return [];
    }
  }

  private upsertTemplate(data: {
    agentId: string;
    stage: string;
    schemaKey: string;
    skeleton: string;
    sampleCount: number;
    matchRatio: number;
  }): OutputTemplate | null {
    const existing = this.getTemplate(data.agentId, data.stage, data.schemaKey);
    const now = this.now();

    if (existing) {
      const newVersion = existing.skeleton === data.skeleton
        ? existing.version
        : existing.version + 1;

      this.db.prepare(`
        UPDATE ${TEMPLATES_TABLE}
        SET skeleton = ?, sample_count = ?, match_ratio = ?, version = ?, updated_at = ?
        WHERE id = ?
      `).run(data.skeleton, data.sampleCount, data.matchRatio, newVersion, now, existing.id);

      return { ...existing, ...data, version: newVersion, updatedAt: now };
    }

    const id = this.generateId();
    this.db.prepare(`
      INSERT INTO ${TEMPLATES_TABLE}
        (id, agent_id, stage, schema_key, skeleton, sample_count, match_ratio, version, last_used_run, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(id, data.agentId, data.stage, data.schemaKey, data.skeleton, data.sampleCount, data.matchRatio, now, now);

    return {
      id,
      agentId: data.agentId,
      stage: data.stage,
      schemaKey: data.schemaKey,
      skeleton: data.skeleton,
      sampleCount: data.sampleCount,
      matchRatio: data.matchRatio,
      version: 1,
      lastUsedRun: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  private rowToTemplate(row: TemplateRow): OutputTemplate {
    return {
      id: row.id,
      agentId: row.agent_id,
      stage: row.stage,
      schemaKey: row.schema_key,
      skeleton: row.skeleton,
      sampleCount: row.sample_count,
      matchRatio: row.match_ratio,
      version: row.version,
      lastUsedRun: row.last_used_run,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TEMPLATES_TABLE} (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        schema_key TEXT NOT NULL,
        skeleton TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        match_ratio REAL NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        last_used_run INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, stage, schema_key)
      )
    `);
  }
}

/**
 * Extract a structural skeleton from a JSON payload string.
 * Keeps keys and types but replaces values with type placeholders.
 */
export function extractSkeleton(payloadStr: string): string {
  try {
    const payload = JSON.parse(payloadStr) as unknown;
    const skeleton = skeletonize(payload);
    return JSON.stringify(skeleton, null, 2);
  } catch {
    return '{}';
  }
}

function skeletonize(value: unknown): unknown {
  if (value === null) return '<null>';
  if (typeof value === 'string') return '<string>';
  if (typeof value === 'number') return '<number>';
  if (typeof value === 'boolean') return '<boolean>';

  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return [skeletonize(value[0])];
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      result[key] = skeletonize((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  return '<unknown>';
}

/**
 * Find the dominant skeleton pattern.
 * Returns the skeleton and count if it exceeds the threshold, null otherwise.
 */
function findDominantSkeleton(
  skeletons: string[],
  threshold: number,
): { skeleton: string; count: number } | null {
  if (skeletons.length === 0) return null;

  const counts = new Map<string, number>();
  for (const s of skeletons) {
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  const [dominant, count] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])[0];

  const ratio = count / skeletons.length;
  if (ratio >= threshold) {
    return { skeleton: dominant, count };
  }

  return null;
}
