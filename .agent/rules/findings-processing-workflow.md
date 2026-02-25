# Findings Processing Workflow

## Trigger Command
**Command:** `"process findings"`

## Input

- Required: path to an audit report produced by `full audit`.

## Execution Contract

- Process every finding without omission.
- Preserve source finding IDs for traceability.
- Generate deterministic task/walkthrough artifacts.
- No finding is closed without command-backed verification and linked walkthrough evidence.

## Processing Rules

1. `MUST_FIX` or `HIGH` findings:
   - create one task + one walkthrough per finding.
2. `SHOULD_FIX` or `LOW` findings:
   - group by implementation theme.
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
