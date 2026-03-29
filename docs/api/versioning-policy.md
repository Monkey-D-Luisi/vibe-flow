# API Versioning Policy

> **Current API version:** 1.0  
> **Effective date:** June 2026

## Versioning scheme

The plugin API version follows [Semantic Versioning 2.0](https://semver.org/)
independently of individual package versions.

| Increment | When |
|-----------|------|
| **MAJOR** | Breaking API changes — removing or renaming methods, changing required parameters, altering return shapes |
| **MINOR** | New API methods, new optional parameters, new events |
| **PATCH** | Bug fixes to existing behaviour with no signature changes |

The API version is tracked in this document and in the `openclaw.plugin.json`
`apiVersion` field. Extensions declare the minimum API version they require.

## Deprecation timeline

1. A deprecated feature is annotated with `@deprecated` and emits a
   `logger.warn()` message at first use with a migration path.
2. The feature remains fully functional for **at least 2 minor versions** after
   the deprecation notice.
3. Removal happens only in the **next major version**.
4. A migration guide is published in `docs/api/migrations/` for every
   deprecation.

### Example

```
API 1.3 — api.emit() deprecated, migration guide published
API 1.4 — api.emit() still functional, warning logged
API 1.5 — api.emit() still functional, warning logged
API 2.0 — api.emit() removed
```

## Breaking change process

1. **RFC:** An issue is opened with the `breaking-change` label describing the
   proposed change and its migration path.
2. **Comment period:** 2 weeks for feedback from extension authors.
3. **ADR:** A decision record is created in `docs/adr/` capturing the rationale,
   alternatives considered, and final decision.
4. **Implementation:** The change is implemented behind a feature flag or
   versioned namespace when possible.
5. **Migration:** A guide and, when feasible, an automated codemod are provided.
6. **Release:** The breaking change ships in the next major version.

## Stability tiers

Every public API method is annotated with a stability tier. See
[stability-tiers.md](stability-tiers.md) for the full classification.

| Tier | Guarantee | Notice period |
|------|-----------|---------------|
| **Stable** | Will not break within a major version | 2 minor versions + major bump |
| **Beta** | May change in minor versions | 1 minor version notice |
| **Experimental** | May change or be removed at any time | None required |

### Tier promotion

- APIs start at **Experimental** unless explicitly promoted.
- Promotion to **Beta** requires: tests, documentation, and at least one
  real-world consumer.
- Promotion to **Stable** requires: 2+ consumers, no API changes for 2 minor
  versions, and an ADR confirming stability.

## Current API stability annotations

See [stability-tiers.md](stability-tiers.md) for the full table.

## Changelog

Breaking changes, deprecations, and new API additions are tracked in the
repository [CHANGELOG.md](../../CHANGELOG.md) following the
[Keep a Changelog](https://keepachangelog.com/) format.
