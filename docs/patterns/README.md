# Architecture Pattern Catalog

Curated cards for recurring architectural solutions. Each card captures intent, forces, trade-offs, and cross-references so teams can make consistent decisions quickly.

## Authoring workflow
1. Run `pnpm patterns:new "Pattern Title"` to scaffold a new card with the next ID.
2. Fill in every required heading in `_TEMPLATE.md` with concise, actionable content.
3. Link back to relevant ADRs using the `adr_refs` field and the **References** section.
4. Execute `pnpm patterns:lint` (or `pnpm patterns:lint:changed`) before opening a PR.
5. Update the catalog index with `pnpm patterns:index` if files change.

## Naming and taxonomy
- **File name**: `P-XXXX-<slug>.md` (4-digit zero-padded ID + kebab-case slug).
- **Categories**: `resilience`, `messaging`, `data`, `integration`, `ui`, `security`, `ops`.
- **Statuses**: `draft`, `accepted`, `deprecated`.
- **Language**: English, decision-focused, avoid marketing copy.

Refer to `catalog.yml` for category descriptions and suggested tags.

## Mandatory structure
Cards must include:
- YAML front matter with `id`, `slug`, `title`, `category`, `status`, `created`, `updated`, `adr_refs`, `related`, `tags`, and `owner`.
- Headings (in order): Intent, Context, Problem, Solution sketch, When to use, When not to use, Trade-offs, Operational notes, Known issues, References.
- In **Trade-offs**, provide entries for Cost, Complexity, Latency, Throughput, Reliability, Scalability, Security, and Operability.
- Deprecated patterns must reference an alternative in `related` and cite it in **References**.

## Tooling commands
- `pnpm patterns:new` - interactive generator.
- `pnpm patterns:lint` - full catalog validation.
- `pnpm patterns:lint:changed` - validate staged changes only.
- `pnpm patterns:test` - unit tests for the linter.
- `pnpm patterns:index` - rebuild the table below grouped by category.

## Editor support
- Use the VS Code snippet `patternfront` to expand the recommended front matter and headings (see `.vscode/patterns.code-snippets`).

## CI integration
- Add the `patterns-lint` GitHub check as required on protected branches, or rely on the Husky pre-commit hook (SKIP_PATTERNS=1) if you prefer local enforcement.

## Catalog index
<!-- patterns-index:start -->

### Resilience

| ID | Title | Status | Updated |
| --- | --- | --- | --- |
| [P-0001](./P-0001-circuit-breaker.md) | Circuit Breaker | accepted | 2025-10-22 |

### Data

| ID | Title | Status | Updated |
| --- | --- | --- | --- |
| [P-0002](./P-0002-outbox.md) | Transactional Outbox | accepted | 2025-10-22 |

<!-- patterns-index:end -->

## Cross-linking
- Reference ADRs using `ADR-####` for traceability and governance.
- Link related patterns using relative Markdown links (for example `[Outbox](./P-0002-outbox.md)`).
- Diagrams (optional) live under `docs/patterns/img/` and should be referenced with relative paths.
