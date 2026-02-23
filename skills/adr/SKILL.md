---
name: ADR Management
description: Create, lint, and index Architecture Decision Records
metadata: { "openclaw": { "requires": { "bins": ["node", "pnpm"] } } }
---

# ADR Management Skill

## Overview
Manage Architecture Decision Records (ADRs) for the project. ADRs document significant architectural decisions with context, alternatives, and consequences.

## Commands

### Create a new ADR
```bash
# Create a new ADR from template
cp docs/adr/_TEMPLATE.md docs/adr/ADR-NNNN-<title>.md
```

### ADR Template
ADRs follow the standard template at `docs/adr/_TEMPLATE.md` with sections:
- Status (Proposed | Accepted | Deprecated | Superseded)
- Date
- Context
- Decision
- Alternatives Considered
- Consequences (Positive, Negative, Neutral)
- References

## Guidelines
- Use sequential numbering: ADR-0001, ADR-0002, etc.
- Write in past tense for decisions already made
- Include at least 2 alternatives considered
- Link to related ADRs when superseding
