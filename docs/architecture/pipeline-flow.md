# Pipeline Flow

Sequence diagram showing the 10-stage pipeline with agent handoffs and
quality gates.

```mermaid
sequenceDiagram
    participant H as Human
    participant PM as pm
    participant PO as po
    participant TL as tech-lead
    participant DS as designer
    participant F1 as front-1
    participant QA as qa
    participant DO as devops
    participant SYS as System

    H->>PM: Product idea
    activate PM

    Note over PM: Stage 1: IDEA
    PM->>PM: Define scope, audience, success criteria
    PM->>PM: pipeline_start()

    Note over PM: Stage 2: ROADMAP
    PM->>PM: Content strategy, milestones, priorities
    PM->>PO: Advance → REFINEMENT
    deactivate PM

    activate PO
    Note over PO: Stage 3: REFINEMENT
    PO->>PO: User stories, acceptance criteria
    PO->>TL: Advance → DECOMPOSITION
    deactivate PO

    activate TL
    Note over TL: Stage 4: DECOMPOSITION
    TL->>TL: Technical breakdown, assignments
    TL->>DS: Advance → DESIGN
    deactivate TL

    activate DS
    Note over DS: Stage 5: DESIGN
    DS->>DS: Visual design system, mockups
    DS->>F1: Advance → IMPLEMENTATION
    deactivate DS

    activate F1
    Note over F1: Stage 6: IMPLEMENTATION
    F1->>F1: Build code, write tests
    F1->>SYS: Quality gate check
    SYS-->>F1: Pass ✓
    F1->>QA: Advance → QA
    deactivate F1

    activate QA
    Note over QA: Stage 7: QA
    QA->>QA: Validation, test coverage, a11y
    QA->>TL: Advance → REVIEW
    deactivate QA

    activate TL
    Note over TL: Stage 8: REVIEW
    TL->>TL: Code review
    alt Blocking violations (< 3 rounds)
        TL->>F1: Loop back → IMPLEMENTATION
    else Approved
        TL->>DO: Advance → SHIPPING
    end
    deactivate TL

    activate DO
    Note over DO: Stage 9: SHIPPING
    DO->>DO: Deploy, create branch, PR
    DO->>SYS: Advance → DONE
    deactivate DO

    Note over SYS: Stage 10: DONE
    SYS->>SYS: Session cleanup, metrics
    SYS-->>H: PR ready for review
```

**What this shows:** A product idea flows through 10 sequential stages, each
owned by a specific agent. Quality gates are checked between stages. The
REVIEW stage can loop back to IMPLEMENTATION if blocking violations are found
(up to 3 rounds). The pipeline completes when DevOps creates the PR and the
system performs cleanup.
