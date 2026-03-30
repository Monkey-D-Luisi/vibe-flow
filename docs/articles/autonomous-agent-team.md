# We Built an 8-Agent Autonomous Product Team. Here's What Happened.

*How a team of AI agents took a product idea from concept to pull request in
4 minutes — with zero human intervention.*

---

## The Pitch

What if your entire product team — product manager, tech lead, designer,
developers, QA, DevOps — were AI agents? Not assistants waiting for
instructions, but autonomous agents that collaborate, make decisions, and
ship working software on their own.

We built exactly that. And then we let it loose on a real task.

Eight AI agents. Ten pipeline stages. Four minutes. One pull request. Zero
human interventions.

This is the story of how we built **vibe-flow**, an open-source autonomous
product team running on [OpenClaw](https://openclaw.ai), and what we learned
when we let it run unsupervised for the first time.

---

## Why Multi-Agent Systems?

Single-agent AI assistants are powerful but limited. They lack specialization,
struggle with long tasks, and have no built-in quality controls. A coding
agent that writes, reviews, and tests its own code is auditing itself — the
same failure mode we'd never accept from a human team.

Multi-agent systems solve this by assigning **distinct roles with clear
boundaries**. Each agent owns one slice of the delivery lifecycle and is
accountable for specific outputs. A product manager agent writes requirements.
A developer agent writes code. A QA agent tests it. A tech lead reviews it.
No agent marks its own homework.

But multi-agent coordination is hard. Agents need:

- A **shared understanding** of what's being built (contracts)
- A **defined sequence** of who acts when (pipeline)
- A way to **make decisions** without waiting for a human (decision engine)
- **Quality checks** at every handoff (quality gates)
- A **budget** so they don't burn through tokens (budget intelligence)

vibe-flow is our answer to all five challenges.

---

## The Architecture (Simplified)

vibe-flow is built as a set of extensions for OpenClaw, a gateway that routes
AI requests to different models and enforces tool-level policies per agent.

At its core, the system has three layers:

### The Agents

Eight specialized agents, each with a defined role:

| Agent | Role | Responsibility |
|-------|------|----------------|
| PM | Product Manager | Defines ideas, creates roadmaps |
| PO | Product Owner | Refines requirements, writes user stories |
| Tech Lead | Technical Lead | Decomposes work, reviews code |
| Designer | UI Designer | Creates visual design systems |
| Backend Dev | Backend Developer | Builds server-side logic |
| Frontend Dev | Frontend Developer | Builds client-side interfaces |
| QA | Quality Assurance | Tests, validates, reports defects |
| DevOps | DevOps Engineer | Deploys, creates CI pipelines |

Each agent can only use the tools it's authorized for. The PM can create
pipeline tasks but can't push code. The Frontend Dev can write files but
can't merge pull requests. Tool policies enforce separation of concerns at
the platform level — not by convention, but by enforcement.

### The Pipeline

Every task flows through a 10-stage pipeline:

**IDEA → ROADMAP → REFINEMENT → DECOMPOSITION → DESIGN → IMPLEMENTATION
→ QA → REVIEW → SHIPPING → DONE**

Each stage has an assigned agent, expected outputs, and transition guards.
An agent can't advance the pipeline until its quality gates pass. The pipeline
is the backbone — it replaces the ad-hoc "figure it out" coordination that
plagues most multi-agent setups.

### The Decision Engine

Agents face decisions constantly: which framework to use, whether to split a
component, how to handle an edge case. Without a decision engine, every
decision becomes a human escalation — defeating the purpose of autonomy.

Our decision engine supports three policies:

- **Auto-resolve**: Low-impact decisions the agent handles alone
- **Escalate**: High-impact decisions sent to a human via Telegram
- **Pause**: Decisions that halt the pipeline until resolved

Circuit breakers prevent runaway auto-resolution: if an agent makes too many
decisions too quickly, the engine escalates automatically.

---

## The Experiment: Task 0077

With the system built (13 epics, 100+ tasks), we needed a real-world test.
Not a unit test. Not a simulation. A genuine product task with a deliverable
that matters.

**The task:** Build a GitHub Pages landing page for vibe-flow's open-source
launch.

**The twist:** The autonomous team would build a page *about itself*. A
self-referential demo — "we built this with the thing we're showing you."

**The rules:** Zero human intervention during pipeline execution. The agents
must take the idea from concept to pull request autonomously. We watch.
We don't touch.

### What Happened

On March 5, 2026, at 15:27 UTC, the PM agent received a product brief:
*"Build a GitHub Pages landing page for vibe-flow OSS launch."*

Four minutes later, at 15:31 UTC, the pipeline reached DONE. PR #220
appeared on GitHub: 17 files, a complete responsive landing page with
semantic HTML5, a CSS design system, interactive Mermaid diagrams, and
CI workflows for deployment and validation.

Here's the stage-by-stage breakdown:

**Stage 1–2: IDEA + ROADMAP (PM, 15:27)**
The PM structured the idea, defined the target audience (open-source
developers, enterprise evaluators), and produced a content strategy with
hero section, pipeline visualization, agent showcase, and quick-start guide.

**Stage 3: REFINEMENT (PO, 15:28)**
The PO turned the content strategy into user stories: responsive design down
to 375px, accessibility with ARIA landmarks, SEO with Open Graph tags and
JSON-LD structured data.

**Stage 4: DECOMPOSITION (Tech Lead, 15:28)**
The Tech Lead split work into implementable units — HTML structure, CSS
design system, JavaScript modules, CI workflows — and made a key architectural
decision: vanilla JS, no framework, zero build step.

**Stage 5: DESIGN (Designer, 15:29)**
The Designer created a complete visual system: dark theme with indigo accents,
system font stack, responsive breakpoints, card-based layouts. Another
decision: dark theme only, no light mode toggle — the audience is developers.

**Stage 6: IMPLEMENTATION (Frontend Dev, 15:29–15:30)**
The Frontend Dev built everything: 457-line HTML file, 430+ lines of CSS,
~150 lines of JavaScript, SVG assets, and CI configuration.

**Stage 7–8: QA + REVIEW (QA + Tech Lead, 15:30)**
QA validated HTML, accessibility, responsive layouts. The Tech Lead reviewed
against the decomposition spec. Both approved.

**Stage 9: SHIPPING (DevOps, 15:31)**
DevOps created GitHub Actions workflows for deployment and HTML validation.
The agent detected a duplicate pipeline from a previous test run and correctly
skipped redundant VCS operations — the circuit-breaker pattern working exactly
as designed.

**Stage 10: DONE (15:31)**
Pipeline complete. PR #220 ready for human review.

---

## What We Learned

### 1. Pipeline Structure Is Everything

The 10-stage pipeline was the single most important architectural decision.
Each agent knows exactly when to act, what the previous agent produced, and
what the next agent expects. Without this structure, multi-agent systems
devolve into chaos — agents talking past each other, duplicating work, or
producing incompatible outputs.

Simpler models (3-stage, 5-stage) don't provide enough separation. More
complex models add overhead without value. Ten stages hit the sweet spot
for software delivery.

### 2. Decision Engines Need Feedback Loops

All five decisions in the Task 0077 run were auto-resolved correctly. But
that's partly luck. After implementing a learning loop (EP12), we discovered
that recording decision outcomes — did this auto-resolution lead to a good
result? — dramatically improves the engine over time.

Rule-based pattern matching ("if similar decisions succeeded before,
auto-resolve; if they failed, escalate") outperformed ML-based approaches
for our scale. It's interpretable, auditable, and doesn't require training
data we don't have.

### 3. Quality Gates Are Non-Negotiable

Every pipeline transition runs quality gates: test coverage ≥ 80% for major
scope (70% for minor), zero lint errors, zero TypeScript errors, and average
cyclomatic complexity ≤ 5.0. These gates catch problems at boundaries —
where one agent's output becomes another's input.

Without gates, errors propagate downstream and compound. A QA agent can't
effectively test code that doesn't follow the design spec. A DevOps agent
can't deploy code that doesn't pass lint. Gates keep the pipeline honest.

### 4. Budget Management Is the #1 Challenge

LLM tokens are expensive. An 8-agent system burning GPT-4o tokens at every
stage can consume a significant budget in hours. We solved this with:

- **Dynamic model routing**: Route each agent to the cheapest model that can
  handle its task. The PM uses GPT-4o (needs reasoning). The Frontend Dev
  uses Claude 3 Haiku (needs speed, produces artifacts).
- **Budget intelligence**: Real-time budget tracking with enforcement. If
  budget runs low, agents automatically downgrade to cheaper models.
- **Free-tier fallbacks**: When budget hits zero, route to copilot-proxy
  free-tier models rather than stopping entirely.

### 5. Operational Failures Are the Real Test

The pipeline produced correct output. But three operational issues emerged:

**Telegram notifications failed silently.** 42 messages got "chat not found"
errors that were swallowed without logging. We added fallback logging to
stdout — notifications appear in container logs even when Telegram delivery
fails.

**Agent sessions persisted after pipeline completion.** Without cleanup,
agents "remembered" the previous run and created duplicate pipelines. We
added a session-clear hook that fires when any pipeline reaches DONE.

**No duplicate pipeline guard existed.** `pipeline.start` could create
multiple pipelines for the same idea. We added title-based deduplication.

These aren't edge cases. They're the kinds of issues that only emerge under
real-world operation of autonomous systems. Unit tests won't find them.
Integration tests might. Running the actual pipeline definitely will.

---

## The Numbers

| Metric | Value |
|--------|-------|
| Total duration | ~4 minutes |
| Pipeline stages completed | 10 of 10 |
| Agents involved | 8 of 8 |
| Files created | 17 |
| Human interventions during run | 0 |
| Auto-resolved decisions | 5 |
| Escalated decisions | 0 |
| Operational issues discovered | 3 |
| Post-pipeline code review findings | 12 |
| Development phases to build the system | 13 epics |
| Total tasks completed | 100+ |
| Architecture decisions documented | 16 ADRs |

---

## What's Next

vibe-flow is an active project in its 13th phase. Current work focuses on
making the system a reference implementation for autonomous agent teams:

- **Stable agent protocol** with versioned message contracts and full
  traceability
- **Local-first observability** with real-time dashboards and pipeline
  metrics
- **Telegram command center** for monitoring and controlling agents from
  a mobile device
- **End-to-end testing** infrastructure for multi-agent pipelines
- **Plugin SDK** with contracts and documentation for building custom
  extensions

The goal isn't just a working system — it's a system others can study, fork,
and build on.

---

## Try It

vibe-flow is open source under the MIT license.

**Get started in three steps:**

```bash
git clone https://github.com/openclaw-ai/vibe-flow.git
cd vibe-flow && pnpm install
pnpm dev
```

**Explore the documentation:**

- [Architecture diagrams](docs/architecture/README.md) — visual overview of
  every subsystem
- [ADR library](docs/adr/) — 16 documented architecture decisions with
  rationale
- [Task 0077 case study](docs/case-studies/task-0077-autonomous-pipeline.md)
  — full timeline of the autonomous pipeline run
- [Getting started guide](docs/getting-started.md) — setup, configuration,
  first run

**Build your own extension:**

The [extension integration guide](docs/extension-integration.md) walks through
building a custom OpenClaw extension. Start with the
[`create-extension` scaffolding tool](tools/create-extension/) to generate the
boilerplate.

---

*vibe-flow is built by the OpenClaw community. If you're interested in
multi-agent systems, autonomous development workflows, or just want to see
AI agents argue about CSS frameworks — come join us.*
