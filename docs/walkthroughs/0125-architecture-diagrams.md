# Walkthrough: 0125 -- Architecture Diagrams (Mermaid)

## Task Reference

- Task: `docs/tasks/0125-architecture-diagrams.md`
- Epic: EP19 -- Showcase & Documentation
- Branch: `feat/EP19-showcase-documentation`

---

## Summary

Created 8 Mermaid architecture diagrams covering all major subsystems of
vibe-flow: system overview, extensions, pipeline flow, agent communication,
hexagonal layers, decision engine, budget flow, and quality gates.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Mermaid over binary images | Renders natively on GitHub, version-controlled, no build step |
| One diagram per file | Keeps files focused and manageable |
| Consistent color coding | Blue=agents, green=system, orange=human, gray=external |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/architecture/README.md` | Created | Index of all diagrams |
| `docs/architecture/system-overview.md` | Created | C4 context diagram |
| `docs/architecture/extension-architecture.md` | Created | Extension interactions |
| `docs/architecture/pipeline-flow.md` | Created | 10-stage pipeline sequence |
| `docs/architecture/agent-communication.md` | Created | Message types and spawn |
| `docs/architecture/hexagonal-layers.md` | Created | Product-team layer diagram |
| `docs/architecture/decision-engine.md` | Created | Auto/escalate/pause flowchart |
| `docs/architecture/budget-flow.md` | Created | Budget enforcement flowchart |
| `docs/architecture/quality-gates.md` | Created | Quality gate evaluation flow |

---

## Follow-ups

- Add CI step to validate Mermaid syntax
- Consider adding sequence diagrams for specific pipeline runs
