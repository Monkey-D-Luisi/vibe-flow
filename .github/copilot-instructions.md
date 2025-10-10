# Copilot instructions for commit messages

Always generate commit messages using the Conventional Commits specification.

Format:
- Header: `type(scope?): subject`
- Body (optional): prose with motivation and context
- Footer (optional): references and breaking changes

Rules:
- `type` must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- `scope` is optional, lower-case, and should match the affected area (e.g., schemas, task-mcp, docs)
- `subject` is imperative, lower-case, no trailing period, concise (<=72 chars)
- If change is breaking, include `BREAKING CHANGE:` in the footer

Examples:
- `feat(task-mcp): add MCP server bootstrap`
- `fix(schemas): correct taskrecord enum values`
- `docs: add task record v1.0 walkthrough`

When multiple files are changed across areas, choose the most relevant scope or omit it.

If the change only affects documentation under `docs/`, prefer `docs:`.
If the change only updates tooling or ci, use `build:` or `ci:` accordingly.
