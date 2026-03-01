# Walkthrough 0042 -- Team Orchestrator Pipeline

## Summary

Implemented four `pipeline.*` tools that give the product team a complete
operator interface for the autonomous pipeline. The pipeline drives ideas through
10 stages (IDEA → ROADMAP → REFINEMENT → DECOMPOSITION → DESIGN →
IMPLEMENTATION → QA → REVIEW → SHIPPING → DONE) with the stage and owner stored
in `TaskRecord.metadata`. `pipeline.start` creates the initial TaskRecord from
an idea; `pipeline.status` gives operators a dashboard view; `pipeline.retry`
re-queues a failed stage; `pipeline.skip` advances past a stage (e.g., skip
DESIGN for backend-only tasks). All tools are co-located in `pipeline.ts` and
registered via `getAllToolDefs`.

## Changes

- `extensions/product-team/src/tools/pipeline.ts` (new): Four tool factory
  functions — `pipelineStartToolDef`, `pipelineStatusToolDef`,
  `pipelineRetryToolDef`, `pipelineSkipToolDef`. The `PIPELINE_STAGES` tuple and
  `STAGE_OWNERS` map are the single source of truth for stage order and agent
  assignments.
- `extensions/product-team/src/schemas/pipeline.schema.ts` (new): TypeBox schemas
  `PipelineStartParams`, `PipelineStatusParams`, `PipelineRetryParams`,
  `PipelineSkipParams`.
- `extensions/product-team/src/tools/index.ts`: Added imports and registrations
  for all four pipeline tools in `getAllToolDefs`.
- `extensions/product-team/test/tools/pipeline.test.ts` (new): 22 tests covering
  all four tools including metadata storage, event log creation, stage truncation,
  retry count increment, skip reason storage, and edge cases (DONE stage can't
  be skipped, nonexistent tasks).
- `docs/roadmap.md`: Tasks 0042, 0043, 0044 marked DONE.

## Decisions

Pipeline state is stored in `TaskRecord.metadata` (not a separate table) since
the existing `task_records` table already has a `metadata` JSON column. This
avoids a new migration and keeps the restart-resilience guarantee: on gateway
restart, any tool reading the task will find the pipeline stage intact.

## Verification

- typecheck: PASS
- lint: PASS
- tests: PASS (479 total, 22 new pipeline + 15 decision + 21 messaging)
