# Retro Report — vibe-flow PR #265

- Task: `01KMAZYA8C38JP2MFJQRNQSC5J`
- Date: 2026-03-22 (UTC)
- PR: #265
- PR title: _TBD (not available in task metadata)_

## Purpose
Capture what went well, what created friction, and concrete next actions (with owners) after PR #265.

## Participants
| Role | Status | Reply message id |
|---|---|---|
| tech-lead | received | `01KMB7H3XEQVC0GDVT89F5EHBB` |
| front-1 | received | `01KMB7FN0ZH4Y9GX6X3HPA1D2K` |
| devops | received | `01KMB7HB2N6Q1YF6QHRAS5V2WD` |
| designer | received | `01KMB7EQ3006KDZF9HVM7Q5GHF` |
| qa | received (2 notes) | `01KMB7GJ9Z4SHGHDS0EBZ2MNJJ`, `01KMB7JXVDDT8M9EH32SMB7PC9` |

## Themes (deduplicated)
### What went well
- Pipeline structure and clear stage ownership kept work cohesive and responsibilities clear.
- Stage visibility (including explicit skip reasons) made it easy to identify where/why work was blocked.
- CI/quality checks provided fast, actionable signal.
- Lightweight/static changes were easy to QA quickly.
- Retro pipeline utilities were implemented as pure functions with solid unit coverage, making the workflow easy to validate.
- Cross-role collaboration was efficient with good alignment between design and development.

### Friction
- Review/QA iterations were noisy due to unclear or inconsistent expectations for required evidence (screenshots, QA artifacts, notes).
- Screenshot-based review is blocked when QA can’t access PR assets directly, creating coordination overhead.
- Stage-timeout recovery/escalation messaging can fire even as work is completing, creating “false alarm” interrupts.
- Missing/unclear ACP configuration (e.g. `acp.defaultAgent` / `acp.allowedAgents`) created avoidable workflow friction.
- Variability in design interpretation caused minor back-and-forth.
- QA signals were noisy/non-deterministic when a runner environment lacked expected docs (e.g. `/docs/runbook.md`).

## Prioritized action items
> Priority rubric: **high** = multiple roles converged or blocks throughput; **medium** = improves efficiency/quality; **low** = nice-to-have.

1) **Standardize a PR “evidence pack” / DoD checklist for UI-facing changes**
   - Description: Require (at minimum) screenshots at 375/768/1280, a short QA validation note (including JS-off smoke if applicable), and a quality gate summary.
   - Owner: `tech-lead`
   - Priority: high
   - Supported by: front-1, qa

2) **Add a completion guard in stage-timeout escalation**
   - Description: In `stage-timeout-cron`, re-check before escalating/spawning recovery so it won’t fire if `${stage}_completedAt` is already set or the task has advanced to `DONE`.
   - Owner: `tech-lead`
   - Priority: high
   - Supported by: tech-lead

3) **Document and ship sane defaults for ACP config**
   - Description: Add and document a default ACP config (`acp.defaultAgent` + `acp.allowedAgents`) plus a quick “how to spawn ACP” note for PM sessions.
   - Owner: `devops`
   - Priority: high
   - Supported by: devops

4) **Make QA/CI test environments deterministic for doc-contract tests**
   - Description: Ensure required docs exist in the test runner workspace, or switch doc-contract tests to use fixtures so results are consistent across `/workspaces` vs `/app`.
   - Owner: `devops`
   - Priority: medium
   - Supported by: qa

5) **Improve design handoffs with annotated edge-case examples**
   - Description: Include annotated examples and explicit styling notes for edge cases to reduce interpretation drift.
   - Owner: `designer`
   - Priority: medium
   - Supported by: designer

## Summary
PR #265 benefited from clear pipeline structure and strong quality signals, but slowed down when expectations for review evidence weren’t explicit and when environment/config gaps (ACP defaults, doc-contract runner parity) created avoidable noise. The top follow-ups are to standardize a lightweight evidence pack for UI PRs, reduce false timeout escalations, and document ACP defaults so orchestration is smoother.
