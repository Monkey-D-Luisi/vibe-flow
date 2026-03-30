# System Overview

High-level context diagram showing how vibe-flow's components interact with
each other and external systems.

```mermaid
graph TB
    subgraph Human["👤 Human Operator"]
        TG["Telegram Client"]
        BR["Browser"]
    end

    subgraph Gateway["OpenClaw Gateway (Docker, port 28789)"]
        RT["Agent Router"]
        TP["Tool Policies"]
        SK["Skill System"]

        subgraph Agents["8 AI Agents"]
            PM["pm"]
            PO["po"]
            TL["tech-lead"]
            DS["designer"]
            B1["back-1"]
            F1["front-1"]
            QA["qa"]
            DO["devops"]
        end
    end

    subgraph Extensions["Plugin Extensions"]
        PT["product-team<br/>Task engine, pipeline,<br/>decisions, quality"]
        QG["quality-gate<br/>Standalone CLI"]
        MR["model-router<br/>Dynamic LLM routing"]
        TN["telegram-notifier<br/>Telegram integration"]
        SB["stitch-bridge<br/>Design tool bridge"]
        VO["virtual-office<br/>Web visualization"]
    end

    subgraph External["External Services"]
        GH["GitHub<br/>VCS, PRs, Actions"]
        LLM["LLM Providers<br/>OpenAI, Anthropic,<br/>Google AI"]
        CP["copilot-proxy<br/>Free-tier fallback"]
        ST["Google Stitch<br/>UI design API"]
    end

    subgraph Data["Data Layer"]
        DB[("SQLite<br/>Tasks, events,<br/>decisions, budgets")]
    end

    TG --> TN
    BR --> VO
    RT --> Agents
    Agents --> TP
    TP --> Extensions
    SK --> Agents
    PT --> DB
    PT --> GH
    MR --> LLM
    MR --> CP
    TN --> TG
    SB --> ST
    VO --> PT

    style Human fill:#fff3e0,stroke:#e65100
    style Gateway fill:#e3f2fd,stroke:#1565c0
    style Extensions fill:#e8f5e9,stroke:#2e7d32
    style External fill:#f5f5f5,stroke:#616161
    style Data fill:#f3e5f5,stroke:#6a1b9a
```

**What this shows:** The OpenClaw gateway runs in Docker and routes requests to
8 AI agents based on role. Agents interact with the system through tool policies
that delegate to 6 plugin extensions. Extensions connect to external services
(GitHub, LLM providers, Telegram, Stitch) and a shared SQLite database.
