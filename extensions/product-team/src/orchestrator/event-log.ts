import type { SqliteEventRepository, EventRecord } from '../persistence/event-repository.js';
import type { TaskStatus } from '../domain/task-status.js';

/**
 * High-level facade over EventRepository with typed logging methods.
 * All events are append-only.
 */
export class EventLog {
  constructor(
    private readonly eventRepo: SqliteEventRepository,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  logTaskCreated(taskId: string, agentId: string | null): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'task.created',
      agentId,
      payload: {},
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logTaskUpdated(
    taskId: string,
    fields: string[],
    agentId: string | null,
  ): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'task.updated',
      agentId,
      payload: { fields },
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logTransition(
    taskId: string,
    from: TaskStatus,
    to: TaskStatus,
    agentId: string,
  ): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'task.transition',
      agentId,
      payload: { from, to },
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logFastTrack(
    taskId: string,
    requestedTo: TaskStatus,
    effectiveTo: TaskStatus,
    agentId: string,
  ): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'task.fast_track',
      agentId,
      payload: {
        requestedTo,
        effectiveTo,
      },
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logWorkflowStep(
    taskId: string,
    stepId: string,
    stepType: string,
    agentId: string,
    schemaKey: string | null,
  ): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'workflow.step.completed',
      agentId,
      payload: {
        stepId,
        stepType,
        schemaKey,
      },
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logLeaseAcquired(taskId: string, agentId: string): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'lease.acquired',
      agentId,
      payload: {},
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logLeaseReleased(taskId: string, agentId: string): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType: 'lease.released',
      agentId,
      payload: {},
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  logVcsEvent(
    taskId: string,
    eventType: `vcs.${string}`,
    agentId: string | null,
    payload: Record<string, unknown>,
  ): EventRecord {
    const event: EventRecord = {
      id: this.generateId(),
      taskId,
      eventType,
      agentId,
      payload,
      createdAt: this.now(),
    };
    this.eventRepo.append(event);
    return event;
  }

  getHistory(taskId: string): EventRecord[] {
    return this.eventRepo.getByTaskId(taskId);
  }
}
