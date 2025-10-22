# Quick Guide to ADRs

Architecture Decision Records capture significant architectural choices together with context, alternatives, and consequences. This guide summarises how we create and maintain ADRs consistently in the repository.

## Recommended workflow
1. Run `pnpm adr:new` and follow the prompts; the command generates a file from `_TEMPLATE.md`, assigns the next available identifier, and pre-fills the title and date.
2. Complete the required sections (`Context`, `Decision`, `Considered Alternatives`, `Consequences`). Append optional sections only when they add meaningful signal.
3. Double-check that the YAML front matter contains the required metadata.
4. Run `pnpm adr:lint` before opening the PR to verify structure, metadata, and references.

## Naming conventions
- **File path**: `docs/adr/ADR-<ID>-<slug>.md`.
- **ID**: incremental sequence with four-digit zero padding (`ADR-0001`, `ADR-0002`, ...).
- **Slug**: short kebab-case summary of the decision (`capture-api-errors`).
- **Title**: concise imperative sentence that summarises the decision.

The ID powers automation (PR Bot, cross references). Always run `pnpm adr:new` to avoid duplicates.

## Metadata (front matter)
Required YAML fields:
- `id`, `title`, `status`, `date`, `owners` (quote handles that start with `@`, for example `'@team/core'`).
- `links` with nested `issues`, `pr`, and `docs` arrays (use empty arrays if not applicable).
- `supersedes` (array) and `superseded_by` (ID or `null`).

Optional fields:
- `area`: domain or system impacted by the decision.
- Any additional metadata that adds relevant context and remains valid YAML.

### Allowed statuses
`status` must be one of: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded`.

Rules:
- `accepted` requires a `date` and at least one entry in `owners`.
- `superseded` must link to another ADR via `superseded_by`; the target ADR must list the current one in `supersedes`.
- `deprecated` and `rejected` do not require links but may reference related decisions.

## Linting and automation
- `pnpm adr:lint`: validates every ADR in the repository.
- `pnpm adr:lint:changed`: validates only Git-modified ADRs (useful for pre-commit hooks).
- The CI workflow (`adr-lint.yml`) runs the linter on each `push` and `pull_request`.

The linter checks:
- File name and location.
- Valid front matter and field types.
- Allowed statuses and transition rules.
- Required headings in the Markdown body.
- Cross references (`supersedes`, `superseded_by`) that exist and point to each other.

## Editor support
- Use the VS Code snippet `adrfront` to insert the recommended front matter and headings (see `.vscode/adr.code-snippets`).
- Refresh the ADR index with `pnpm adr:index`; the command rewrites the section below.

## ADR index
<!-- adr-index:start -->

| ID | Title | Status | Date |
| --- | --- | --- | --- |
| [ADR-0001](ADR-0001-lint-pipeline.md) | Enable lint pipeline for ADRs | accepted | 2025-01-15 |

<!-- adr-index:end -->

## Referencing ADRs in PRs
Mention the ADR ID (`ADR-000X`) in the PR description so the PR Bot surfaces it in the automated checklist. Link directly to the relevant ADRs when a change implements or updates a decision.
