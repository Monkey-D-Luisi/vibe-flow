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

const ModuleSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  responsibility: Type.String({ minLength: 1 }),
  dependencies: Type.Array(Type.String()),
});

const ContractSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  schema: Type.String({ minLength: 1 }),
  direction: Type.Union([
    Type.Literal('in'),
    Type.Literal('out'),
    Type.Literal('bidirectional'),
  ]),
});

const TestPlanItemSchema = Type.Object({
  scenario: Type.String({ minLength: 1 }),
  type: Type.Union([
    Type.Literal('unit'),
    Type.Literal('integration'),
    Type.Literal('e2e'),
  ]),
  priority: Type.Union([
    Type.Literal('high'),
    Type.Literal('medium'),
    Type.Literal('low'),
  ]),
});

export const ArchitecturePlanSchema = Type.Object({
  modules: Type.Array(ModuleSchema, { minItems: 1 }),
  contracts: Type.Array(ContractSchema, { minItems: 1 }),
  patterns: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  test_plan: Type.Array(TestPlanItemSchema, { minItems: 1 }),
  adr_id: Type.String({ minLength: 1 }),
});

const RgrPhaseSchema = Type.Union([
  Type.Literal('red'),
  Type.Literal('green'),
  Type.Literal('refactor'),
]);

const RgrEntrySchema = Type.Object({
  phase: RgrPhaseSchema,
  description: Type.String({ minLength: 1 }),
  files_changed: Type.Array(Type.String({ minLength: 1 })),
});

export const DevResultSchema = Type.Object({
  diff_summary: Type.String({ minLength: 1 }),
  metrics: Type.Object({
    coverage: Type.Number({ minimum: 0, maximum: 100 }),
    lint_clean: Type.Boolean(),
    lint_violations: Type.Optional(Type.Integer({ minimum: 0 })),
    complexity_avg: Type.Optional(Type.Number({ minimum: 0 })),
  }),
  red_green_refactor_log: Type.Array(RgrEntrySchema, { minItems: 1 }),
});

const EvidenceStatusSchema = Type.Union([
  Type.Literal('pass'),
  Type.Literal('fail'),
  Type.Literal('skip'),
  Type.Literal('not_tested'),
]);

const EvidenceEntrySchema = Type.Object({
  criterion: Type.String({ minLength: 1 }),
  status: EvidenceStatusSchema,
  test_names: Type.Array(Type.String({ minLength: 1 })),
  notes: Type.Optional(Type.String()),
});

export const QaReportSchema = Type.Object({
  total: Type.Integer({ minimum: 0 }),
  passed: Type.Integer({ minimum: 0 }),
  failed: Type.Integer({ minimum: 0 }),
  skipped: Type.Integer({ minimum: 0 }),
  evidence: Type.Array(EvidenceEntrySchema, { minItems: 1 }),
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
      file: Type.Optional(Type.String()),
      suggested_fix: Type.Optional(Type.String()),
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
