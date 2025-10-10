# ADR-TR-001: TaskRecord Identity, Concurrency Control, and Round Limits

## Status
Accepted

## Context
We need to design a TaskRecord system for task orchestration that supports:
- Offline-first workflows with potential merge conflicts
- TDD-driven development with evidence tracking
- Quality gates and review cycles
- Integration with external systems (GitHub, Git)

## Decision
We will implement the following architectural decisions:

### 1. Identity: ULID with TR- Prefix
- **Rationale**: ULIDs are sortable by time, URL-safe, and collision-resistant. The TR- prefix clearly identifies TaskRecords.
- **Format**: `TR-[0-9A-HJKMNP-TV-Z]{26}` (26-character ULID)
- **Benefits**:
  - Time-sortable for efficient queries
  - No coordination needed for ID generation
  - Clear namespace separation

### 2. Concurrency Control: Optimistic Locking with Revision Numbers
- **Rationale**: Optimistic locking is simpler than pessimistic locking for distributed/offline scenarios and provides better user experience.
- **Implementation**: Integer `rev` field starting at 0, incremented on each update.
- **Conflict Resolution**: Updates require `if_rev` parameter matching current `rev`.
- **Benefits**:
  - No locks held during user thinking time
  - Clear conflict detection
  - Easy to implement in SQLite

### 3. Review Round Limits: Maximum 2 Rounds
- **Rationale**: Prevents infinite review cycles while allowing for reasonable iteration.
- **Implementation**: `rounds_review` counter incremented on `review → dev` transitions.
- **Guard**: Block transition if `rounds_review >= 2`.
- **Benefits**:
  - Ensures forward progress
  - Forces escalation when needed
  - Simple to implement and understand

## Consequences
- **Positive**:
  - Robust offline support
  - Clear conflict resolution
  - Predictable review process
- **Negative**:
  - Requires client-side conflict handling
  - Review limits may need adjustment based on usage
- **Risks**:
  - ULID generation libraries must be reliable
  - Clients must handle 409 conflicts gracefully

## Alternatives Considered
- UUIDv4: Not time-sortable, harder to debug
- Pessimistic locking: Poor UX for distributed scenarios
- Unlimited review rounds: Risk of stagnation
- Timestamp-based versioning: Clock skew issues

## References
- [ULID Specification](https://github.com/ulid/spec)
- [Optimistic vs Pessimistic Locking](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)