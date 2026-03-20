# EP20 -- Virtual Office

**Phase:** 14
**Status:** IN_PROGRESS
**Priority:** MEDIUM

## Goal

Visualize the 8 AI agents as pixel-art characters in a virtual office served at `/office`. Agents walk, type, read, and react in real-time based on pipeline stage and tool activity.

## Inspiration

[pixel-agents](https://github.com/pablodelucca/pixel-agents) -- VS Code extension that visualizes Claude Code sessions as pixel-art characters. We adapt the concept for OpenClaw's web gateway.

## Scope

- New extension `extensions/virtual-office/` serving Canvas 2D webapp at `/office`
- Custom AI-generated pixel-art sprites for 8 agents (pm, tech-lead, po, designer, back-1, front-1, qa, devops)
- Real-time data: pipeline stages + tool activity via lifecycle hooks + WebSocket broadcast
- Fixed office layout (no editor): 8 desks, meeting room, coffee area, server rack
- Interactivity: click-to-inspect agent info, speech bubbles, Matrix spawn/despawn effects

## Tasks

| ID | Title | Scope | Deps |
|----|-------|-------|------|
| 0128 | Extension Scaffolding + Static File Server | MINOR | -- |
| 0129 | Canvas Engine Core | MAJOR | 0128 |
| 0130 | Pixel Art Sprite Generation (8 agents) | MINOR | 0129 |
| 0131 | WebSocket Bridge (Hooks to Broadcast to Frontend) | MAJOR | 0128 |
| 0132 | Agent State Mapping (Stages to Animations) | MAJOR | 0129, 0131 |
| 0133 | Interactivity (Click, Bubbles, Matrix) | MAJOR | 0130, 0132 |
| 0134 | Integration Testing + Polish | MINOR | 0131-0133 |

## Dependencies

- OpenClaw SDK `registerHttpRoute` with `match: 'prefix'`
- OpenClaw SDK `registerGatewayMethod` for WebSocket
- Lifecycle hooks: `before_tool_call`, `after_tool_call`, `agent_end`, `subagent_spawned`

## Risks

- `registerGatewayMethod` availability (fallback: HTTP polling)
- `match: 'prefix'` support (fallback: manual URL parsing)
- Browser WS auth (use same auth as Control UI)
