# Task 0058: D-004 — Split product-team Registration Modules (MEDIUM)

## Source Finding IDs
D-004

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Development |
| Severity | MEDIUM |
| Confidence | HIGH |
| Evidence | `extensions/product-team/src/index.ts` is 397 lines, containing both CI webhook route registration and HTTP route registration inline alongside tool and skill registration; single file does too many things |
| Impact | Large registration file is hard to navigate, review, and test; changes to CI webhook logic risk touching unrelated HTTP route code |
| Recommendation | Extract CI webhook route registration to `src/registration/ci-webhook-route.ts` and HTTP route registration to `src/registration/http-routes.ts`; index.ts should only orchestrate calls to these modules |

## Objective
Reduce `extensions/product-team/src/index.ts` complexity by extracting CI webhook route registration and HTTP route registration into dedicated modules under `src/registration/`.

## Acceptance Criteria
- [x] `extensions/product-team/src/registration/ci-webhook-route.ts` created (exports `registerCiWebhookRoute`)
- [x] `extensions/product-team/src/registration/http-routes.ts` created (exports `registerHttpRoutes`)
- [x] `extensions/product-team/src/index.ts` reduced from 397 to ≤300 lines
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes

## Status
DONE
