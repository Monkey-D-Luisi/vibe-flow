# Task: 0081 -- Dynamic Model Resolver Hook

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP10 -- Dynamic Model Routing |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-08 |
| Branch | `feat/0081-dynamic-model-resolver-hook` |

---

## Goal

Implement the `before_model_resolve` hook that reads complexity score and provider health to select the optimal model for each LLM request, enabling dynamic per-request routing with automatic fallback to static routing on error.

---

## Context

Tasks 0079 (complexity scorer) and 0080 (provider health cache) delivered the two inputs needed for dynamic routing. The `before_model_resolve` hook in `index.ts` is commented out. This task activates it with a model resolver that combines complexity tier, provider health status, and budget state to select the optimal model.

---

## Scope

### In Scope

- `model-resolver.ts` with resolution algorithm
- Activation of `before_model_resolve` hook in `index.ts`
- Config-gated activation (`dynamicRouting.enabled`)
- Fallback to static routing on any error or timeout
- Structured logging of resolution decisions
- Comprehensive test suite

### Out of Scope

- Cost-aware tier downgrade (Task 0082)
- Fallback chain with copilot-proxy (Task 0083)
- Budget integration beyond placeholder interface

---

## Requirements

1. Resolution algorithm: complexity tier + provider health + optional budget → model selection
2. Hook activates only when `config.dynamicRouting.enabled` is true
3. Resolver completes in < 100ms (99th percentile)
4. Any error or timeout (> 500ms) falls through to static routing
5. Resolution decision logged with correlation ID

---

## Acceptance Criteria

- [x] AC1: Hook activates only if `config.dynamicRouting.enabled` is true
- [x] AC2: Low-complexity tasks route to free/cheap models when copilot-proxy healthy
- [x] AC3: High-complexity tasks route to primary (premium) models
- [x] AC4: DOWN provider triggers fallback to first healthy alternative
- [x] AC5: Fallback to static routing on any error
- [x] AC6: Resolution decision includes structured log with correlation ID
- [x] AC7: >= 90% test coverage including timeout and error fallback paths

---

## Constraints

- Must use existing `scoreComplexity` from Task 0079
- Must use existing `ProviderHealthCache` from Task 0080
- No breaking changes to existing health endpoint or cache
- ESM imports with `.js` extensions
- Strict TypeScript, no `any`

---

## Implementation Steps

1. Create `model-resolver.ts` with resolution types and `resolveModel()` function
2. Create `model-resolver.test.ts` with comprehensive test coverage
3. Update `openclaw.plugin.json` config schema with `dynamicRouting` property
4. Modify `index.ts` to activate the `before_model_resolve` hook
5. Run quality checks

---

## Testing Plan

- Unit tests: Resolution algorithm, tier mapping, fallback behavior, error handling, timeout
- Integration tests: Hook activation with config gating
- Edge cases: Missing metadata, unknown providers, all providers DOWN

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md)
- [Coding Standards](../../.agent/rules/coding-standards.md)
- [Testing Standards](../../.agent/rules/testing-standards.md)
- [EP10 Backlog](../backlog/EP10-dynamic-model-routing.md)
