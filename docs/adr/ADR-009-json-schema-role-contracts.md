# ADR-009: JSON Schema Contracts for Role Outputs

## Status
Accepted

## Date
2026-02-27

## Context

The product-team extension uses a workflow system where different agents (PM,
PO, Tech Lead, Designer, Backend Dev, Frontend Dev, QA, DevOps) produce
structured outputs at each pipeline stage. Without contracts, each agent's
output format was ad-hoc — the next agent in the pipeline had to guess what
fields were available and handle missing data defensively.

Problems without contracts:

- No way to validate that an agent produced a complete output before advancing.
- The step runner couldn't distinguish between a valid minimal output and a
  malformed one.
- Schema drift: agents responded differently depending on the LLM model used.
- Testing required running full LLM calls to verify output structure.

## Decision

Define **JSON Schema 2020-12 contracts** for every role output, validated at
pipeline stage transitions.

Design:

1. Each role has a named schema: `po_brief`, `architecture_plan`, `dev_result`,
   `qa_report`, `review_result`, `design_spec`, etc.
2. Schemas are validated using TypeBox (compile-time TypeScript types +
   runtime JSON Schema validation).
3. The step runner validates the output against the expected schema before
   advancing the pipeline. Invalid outputs trigger a retry or escalation.
4. Schemas are versioned alongside the protocol version (EP13).

## Alternatives Considered

### Unstructured text outputs

- **Pros:** Maximum flexibility, no schema maintenance burden.
- **Cons:** Cannot validate, cannot parse programmatically, cannot use as
  input for the next pipeline stage without manual extraction. This was the
  initial approach and it broke constantly when agents produced incomplete
  or differently-formatted outputs.

### TypeScript interfaces only (no runtime validation)

- **Pros:** Type safety at compile time, lighter than JSON Schema.
- **Cons:** No runtime validation means malformed LLM outputs pass silently.
  The LLM doesn't know about TypeScript interfaces — it can produce any JSON.
  Runtime validation is essential for LLM outputs.

### Zod schemas

- **Pros:** Excellent TypeScript integration, chainable validation, transform
  support.
- **Cons:** Zod schemas are TypeScript-only and cannot be serialized as
  standard JSON Schema for cross-language use or documentation generation.
  TypeBox produces both TypeScript types and standard JSON Schema 2020-12,
  which aligns with the project's open standard preference.

## Consequences

### Positive

- Pipeline stage transitions are validated — malformed outputs are caught
  before they propagate to the next agent.
- Schemas serve as documentation — new contributors can read the schema to
  understand what each agent produces.
- TypeBox provides both compile-time types and runtime validation from a
  single definition.
- Schemas are reusable in the quality-contracts package for cross-extension
  validation.

### Negative

- Schema maintenance burden: every change to an agent's output format
  requires updating the schema.
- Overly strict schemas can reject valid-but-unexpected LLM outputs.
  Schemas need to be permissive enough for LLM variation while strict
  enough to catch errors.

### Neutral

- JSON Schema 2020-12 is a widely supported standard, making the contracts
  portable beyond the TypeScript ecosystem.

## References

- EP03 -- Role Execution (initial contract implementation)
- EP13 -- Stable Agent Protocol (schema versioning and protocol negotiation)
- `packages/quality-contracts/` — shared schema definitions
