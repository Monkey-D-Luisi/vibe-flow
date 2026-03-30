# Extension Architecture

Component diagram showing the 6 extensions and how they interact.

```mermaid
graph LR
    subgraph PT["product-team"]
        TE["Task Engine"]
        WF["Workflow / Pipeline"]
        DE["Decision Engine"]
        QT["Quality Tools"]
        VC["VCS Automation"]
        MS["Messaging"]
        BU["Budget Manager"]
        LE["Learning Loop"]
    end

    subgraph QG["quality-gate"]
        CL["CLI Runner"]
        LP["Lint Parser"]
        CP["Coverage Parser"]
        CX["Complexity (regex)"]
        AC["Accessibility"]
        AU["Audit"]
    end

    subgraph QC["quality-contracts"]
        SP["Shared Parsers"]
        GP["Gate Policy"]
        VA["Validators"]
    end

    subgraph MR["model-router"]
        CS["Complexity Scorer"]
        PH["Provider Health"]
        DR["Dynamic Resolver"]
        CA["Cost-Aware Router"]
        FC["Fallback Chain"]
    end

    subgraph TN["telegram-notifier"]
        BT["Bot Handler"]
        SC["Slash Commands"]
        PP["Persona Router"]
        DB2["Decision Buttons"]
    end

    subgraph SB["stitch-bridge"]
        DG["Design Generator"]
        DE2["Design Editor"]
        DV["Variant Generator"]
    end

    subgraph VO["virtual-office"]
        SF["Static File Server"]
        CE["Canvas Engine"]
        SS["SSE Bridge"]
        SM["State Mapping"]
    end

    QT --> QC
    QG --> QC
    PT --> MR
    PT --> TN
    PT --> VO
    SB -.-> PT
    BU --> MR

    style PT fill:#e3f2fd,stroke:#1565c0
    style QG fill:#e8f5e9,stroke:#2e7d32
    style QC fill:#f3e5f5,stroke:#6a1b9a
    style MR fill:#fff3e0,stroke:#e65100
    style TN fill:#e0f7fa,stroke:#00695c
    style SB fill:#fce4ec,stroke:#c62828
    style VO fill:#f1f8e9,stroke:#558b2f
```

**What this shows:** The product-team extension is the core, containing the task
engine, pipeline, decision engine, quality tools, VCS automation, messaging,
budget management, and learning loop. Both product-team and quality-gate consume
shared parsers from quality-contracts. The model-router provides dynamic LLM
routing. Telegram-notifier and virtual-office provide human interfaces. The
stitch-bridge connects to Google Stitch for design generation.
