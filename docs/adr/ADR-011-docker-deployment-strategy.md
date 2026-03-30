# ADR-011: Docker Deployment Strategy (Isolated from WSL)

## Status
Accepted

## Date
2026-03-10

## Context

The OpenClaw gateway was initially deployed inside WSL (Windows Subsystem for
Linux) for development. As the project matured through EP08, the autonomous
product team needed a reproducible, isolated deployment that:

- Does not interfere with the developer's WSL-based development environment.
- Can be started and stopped cleanly with a single command.
- Provides consistent behavior across Windows, macOS, and Linux hosts.
- Supports multi-container orchestration (gateway + future services).
- Persists data (SQLite databases, event logs) across container restarts.

Running the gateway directly in WSL created several problems: port conflicts
with development servers, environment variable leakage, and difficulty
reproducing the exact same environment on CI.

## Decision

Deploy the OpenClaw gateway in a **Docker container** isolated from the host
WSL environment.

Design:

1. **Dockerfile** at repo root builds an image with Node 22, pnpm, and all
   extensions pre-installed.
2. **docker-compose.yml** for development with volume mounts for live code
   editing.
3. **docker-compose.prod.yml** for production with built artifacts, health
   checks, and restart policies.
4. **Port 28789** (non-standard) avoids conflicts with common development
   ports (3000, 5000, 8080).
5. **Named volumes** persist SQLite databases and configuration across
   container restarts.
6. **`docker-entrypoint.sh`** handles database migration and gateway startup
   sequencing.

## Alternatives Considered

### Continue using WSL directly

- **Pros:** Zero overhead, fastest iteration, direct filesystem access.
- **Cons:** Not reproducible — depends on the developer's WSL configuration.
  Port conflicts with development servers. Environment isolation is manual.
  Cannot be replicated on CI without WSL-specific setup.

### Kubernetes (minikube / kind)

- **Pros:** Production-grade orchestration, scaling, health management.
- **Cons:** Massive overhead for a single-host deployment. The gateway runs
  as a single process — Kubernetes pod scheduling, service discovery, and
  ingress are all unnecessary complexity. Violates the local-first constraint.

### systemd service in WSL

- **Pros:** Native Linux process management, auto-restart on crash.
- **Cons:** Windows-specific (requires WSL), no container isolation, harder
  to reproduce across machines, no compose-style multi-service orchestration.

## Consequences

### Positive

- Reproducible deployment: `docker compose up` works identically on any
  machine with Docker installed.
- Clean isolation: gateway port, data, and configuration are fully contained.
- Production profile with health checks and restart policies.
- CI can use the same Docker image for integration testing.

### Negative

- Docker adds startup overhead (~5-10 seconds) compared to direct execution.
- Volume mount performance on Windows (Docker Desktop) is slower than native
  filesystem access.
- Debugging requires `docker exec` or `docker logs` instead of direct access.

### Neutral

- Docker Compose is the de facto standard for local multi-container
  development, making the setup familiar to most developers.

## References

- EP08 -- Autonomous Product Team (Docker deployment requirement)
- `Dockerfile` — gateway image definition
- `docker-compose.yml` / `docker-compose.prod.yml` — orchestration profiles
- `scripts/docker-entrypoint.sh` — container startup script
