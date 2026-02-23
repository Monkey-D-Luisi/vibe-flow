---
name: Architecture Patterns
description: Create, lint, and index Architecture Pattern entries
metadata: { "openclaw": { "requires": { "bins": ["node", "pnpm"] } } }
---

# Architecture Patterns Skill

## Overview
Manage the Architecture Pattern Catalog for the project. Patterns document reusable solutions to recurring design problems with trade-offs and ADR references.

## Commands

### Create a new pattern
```bash
# Create a new pattern from template
cp docs/patterns/_TEMPLATE.md docs/patterns/P-NNNN-<title>.md
```

### Pattern Template
Patterns follow the standard template with sections:
- Status (Draft | Active | Deprecated)
- Category (Structural, Behavioral, Integration, Data, Security)
- Context and Problem
- Solution
- Trade-offs (Pros and Cons)
- Related ADRs
- Examples

## Guidelines
- Use sequential numbering: P-0001, P-0002, etc.
- Every pattern must reference at least one ADR
- Include concrete code examples where applicable
- Document trade-offs explicitly
