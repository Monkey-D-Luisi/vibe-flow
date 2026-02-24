import { Type, type Static, type TSchema } from '@sinclair/typebox';

const ScopeSchema = Type.Union([
  Type.Literal('major'),
  Type.Literal('minor'),
  Type.Literal('patch'),
]);

export const PoBriefSchema = Type.Object({
  title: Type.String({ minLength: 1 }),
  acceptance_criteria: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  scope: ScopeSchema,
  done_if: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export const ArchitecturePlanSchema = Type.Object({
  modules: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  contracts: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  patterns: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  test_plan: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  adr_id: Type.String({ minLength: 1 }),
});

export const DevResultSchema = Type.Object({
  diff_summary: Type.String({ minLength: 1 }),
  metrics: Type.Object({
    coverage: Type.Number({ minimum: 0, maximum: 100 }),
    lint_clean: Type.Boolean(),
  }),
  red_green_refactor_log: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export const QaReportSchema = Type.Object({
  total: Type.Integer({ minimum: 0 }),
  passed: Type.Integer({ minimum: 0 }),
  failed: Type.Integer({ minimum: 0 }),
  skipped: Type.Integer({ minimum: 0 }),
  evidence: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

const ViolationSeveritySchema = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('critical'),
]);

export const ReviewResultSchema = Type.Object({
  violations: Type.Array(
    Type.Object({
      rule: Type.String({ minLength: 1 }),
      severity: ViolationSeveritySchema,
      message: Type.String({ minLength: 1 }),
    }),
  ),
  overall_verdict: Type.Union([Type.Literal('approve'), Type.Literal('changes_requested')]),
});

export const ROLE_OUTPUT_SCHEMAS = {
  po_brief: PoBriefSchema,
  architecture_plan: ArchitecturePlanSchema,
  dev_result: DevResultSchema,
  qa_report: QaReportSchema,
  review_result: ReviewResultSchema,
} as const satisfies Record<string, TSchema>;

export type RoleSchemaKey = keyof typeof ROLE_OUTPUT_SCHEMAS;
export type PoBrief = Static<typeof PoBriefSchema>;
export type ArchitecturePlan = Static<typeof ArchitecturePlanSchema>;
export type DevResult = Static<typeof DevResultSchema>;
export type QaReport = Static<typeof QaReportSchema>;
export type ReviewResult = Static<typeof ReviewResultSchema>;

export const ROLE_SCHEMA_KEYS = Object.keys(ROLE_OUTPUT_SCHEMAS) as RoleSchemaKey[];

export function isRoleSchemaKey(value: string): value is RoleSchemaKey {
  return ROLE_SCHEMA_KEYS.includes(value as RoleSchemaKey);
}
