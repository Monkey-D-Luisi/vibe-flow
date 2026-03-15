# Findings Processing Workflow

## Trigger Command
**Command:** `"process findings"`

## Input

- Required: path to an audit report produced by `full audit`.

## Execution Contract

- **Plan-first**: present the findings triage and implementation plan to the user before starting fixes.
- Process every finding without omission.
- Preserve source finding IDs for traceability.
- Generate deterministic task/walkthrough artifacts.
- No finding is closed without command-backed verification and linked walkthrough evidence.
- **Any doubt or uncertainty?** Use the questionnaire tool (always include a free-text field).

## Plan-Then-Implement Mandate

For each finding, execute in order:

1. **Plan** — outline the fix approach and get user approval. Then apply the fix in source code, config, or docs.
2. **Verify** — run the relevant command(s) (`pnpm typecheck`, `pnpm lint`, `pnpm test`, etc.) to confirm the fix.
3. **Commit** — one commit per finding or per theme group. Use `fix(<finding-id>): <description>` format.
4. **Document** — write the task + walkthrough files recording what was done.

Acceptable blockers (skip implementation, go directly to BLOCKED artifacts):
- Requires infra access outside the repository (e.g., runner relocation, branch protection settings).
- Requires 3rd-party upstream release (e.g., transitive vulnerability in locked dependency).
- Genuine ambiguity that cannot be resolved without human input — use questionnaire tool first.

## Processing Rules

1. `MUST_FIX` or `HIGH` findings:
   - implement fully, commit individually.
   - create one task + one walkthrough per finding.
2. `SHOULD_FIX` or `LOW` findings:
   - group by implementation theme.
   - implement together, commit per theme group.
   - create shared task + walkthrough pairs per theme.
3. Keep explicit mapping from source finding IDs to generated artifacts.

## ID Allocation Rules

1. Read existing files under `docs/tasks/`.
2. Find highest numeric task id from files matching `^[0-9]{4}-`.
3. Allocate new IDs sequentially (`max + 1`, `max + 2`, ...).
4. Use the same filename stem for paired files in:
   - `docs/tasks/`
   - `docs/walkthroughs/`

## Generated Artifact Contract

For each generated task:

- include immutable finding snapshot (ID, axis, severity, evidence, impact, recommendation)
- include traceability field: `Source Finding IDs`
- include measurable acceptance criteria

For each generated walkthrough:

- execution journal
- commands run
- verification evidence
- closure decision

## Processing Ledger (mandatory)

Create or update a ledger section in the source audit report mapping:

`Finding ID -> Task File -> Walkthrough File -> Status`

Allowed status values:

- `PLANNED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE_VERIFIED`

## Closure Criteria

A finding can move to `DONE_VERIFIED` only when:

1. linked task is complete
2. linked walkthrough contains command-backed verification
3. behavior change is validated by tests and/or reproducible checks
4. residual risk is documented if partial mitigation is used

## Output

Produce:

- generated task/walkthrough files
- updated processing ledger in audit report
- summary list of created artifacts and unblocked next action order
