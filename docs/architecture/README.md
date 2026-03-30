# Architecture Diagrams

Comprehensive architecture diagrams for vibe-flow, rendered using Mermaid.

## Index

| Diagram | Type | Description |
|---------|------|-------------|
| [System Overview](system-overview.md) | C4 Context | Gateway, extensions, agents, and external systems |
| [Extension Architecture](extension-architecture.md) | Component | 6 extensions and their interactions |
| [Pipeline Flow](pipeline-flow.md) | Sequence | 10-stage pipeline with agent handoffs |
| [Agent Communication](agent-communication.md) | Sequence | Message types, spawn, and escalation |
| [Hexagonal Layers](hexagonal-layers.md) | Component | Product-team extension layer structure |
| [Decision Engine](decision-engine.md) | Flowchart | Auto/escalate/pause decision paths |
| [Budget Flow](budget-flow.md) | Flowchart | Budget enforcement and downgrade flow |
| [Quality Gates](quality-gates.md) | Flowchart | Quality gate evaluation pipeline |

## Visual Language

- **Blue** — Agents and agent-related components
- **Green** — System components and services
- **Orange** — Human interaction points
- **Gray** — External systems and dependencies
- **Purple** — Data stores and persistence
