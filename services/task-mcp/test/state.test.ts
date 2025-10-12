import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskRepository } from '../src/repo/repository.js';
import { StateRepository, EventRepository, LeaseRepository } from '../src/repo/state.js';

describe('State Management', () => {
  let taskRepo: TaskRepository;
  let stateRepo: StateRepository;
  let eventRepo: EventRepository;
  let leaseRepo: LeaseRepository;

  beforeEach(() => {
    taskRepo = new TaskRepository(':memory:');
    stateRepo = new StateRepository(taskRepo.database);
    eventRepo = new EventRepository(taskRepo.database);
    leaseRepo = new LeaseRepository(taskRepo.database);
  });

  afterEach(() => {
    taskRepo.close();
  });

  describe('StateRepository', () => {
    it('should create and get orchestrator state', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      const state = stateRepo.create(taskId);
      expect(state.task_id).toBe(taskId);
      expect(state.current).toBe('po');
      expect(state.rev).toBe(0);

      const retrieved = stateRepo.get(taskId);
      expect(retrieved).toMatchObject(state);
    });

    it('should update state with optimistic locking', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      stateRepo.create(taskId);

      const updated = stateRepo.update(taskId, 0, { current: 'arch', last_agent: 'architect' });
      expect(updated.current).toBe('arch');
      expect(updated.last_agent).toBe('architect');
      expect(updated.rev).toBe(1);

      expect(() => stateRepo.update(taskId, 0, { current: 'dev' })).toThrow('Optimistic lock failed');
    });

    it('should handle rounds_review increment', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      stateRepo.create(taskId);

      const updated = stateRepo.update(taskId, 0, { rounds_review: 1 });
      expect(updated.rounds_review).toBe(1);
    });
  });

  describe('EventRepository', () => {
    it('should append and retrieve events', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      const event = eventRepo.append(taskId, 'handoff', { from_agent: 'po', to_agent: 'architect' });
      expect(event.task_id).toBe(taskId);
      expect(event.type).toBe('handoff');
      expect(event.payload).toEqual({ from_agent: 'po', to_agent: 'architect' });

      const events = eventRepo.getByTaskId(taskId);
      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject(event);
    });

    it('should search events by type', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      eventRepo.append(taskId, 'handoff', { from_agent: 'po', to_agent: 'architect' });
      eventRepo.append(taskId, 'transition', { from_state: 'po', to_state: 'arch' });
      eventRepo.append(taskId, 'handoff', { from_agent: 'architect', to_agent: 'dev' });

      const handoffs = eventRepo.search(taskId, 'handoff');
      expect(handoffs.length).toBe(2);
      expect(handoffs.every(e => e.type === 'handoff')).toBe(true);

      const transitions = eventRepo.search(taskId, 'transition');
      expect(transitions.length).toBe(1);
      expect(transitions[0].type).toBe('transition');
    });

    it('should limit results', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      for (let i = 0; i < 5; i++) {
        eventRepo.append(taskId, 'handoff', { index: i });
      }

      const limited = eventRepo.getByTaskId(taskId, 3);
      expect(limited.length).toBe(3);
    });
  });

  describe('LeaseRepository', () => {
    it('should acquire and release leases', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      const lease = leaseRepo.acquire(taskId, 'architect', 300);
      expect(lease.task_id).toBe(taskId);
      expect(lease.owner_agent).toBe('architect');
      expect(lease.lease_id.startsWith('LE-')).toBe(true);

      const retrieved = leaseRepo.get(taskId);
      expect(retrieved).toEqual(lease);

      const released = leaseRepo.release(taskId, lease.lease_id);
      expect(released).toBe(true);

      const afterRelease = leaseRepo.get(taskId);
      expect(afterRelease).toBeNull();
    });

    it('should prevent concurrent leases', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      leaseRepo.acquire(taskId, 'agent1', 300);

      expect(() => leaseRepo.acquire(taskId, 'agent2', 300)).toThrow('Lease held by another agent');
    });

    it('should allow lease renewal by same agent', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      const agent = 'architect';

      const lease1 = leaseRepo.acquire(taskId, agent, 300);
      const lease2 = leaseRepo.acquire(taskId, agent, 300);

      expect(lease2.owner_agent).toBe(agent);
      expect(lease2.lease_id).not.toBe(lease1.lease_id); // New lease ID
    });

    it('should validate lease ownership', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      leaseRepo.acquire(taskId, 'agent1', 300);

      expect(leaseRepo.isValid(taskId)).toBe(true);
      expect(leaseRepo.isValid(taskId, 'wrong-id')).toBe(false);
    });

    it('should cleanup expired leases', async () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task first
      taskRepo.create({
        id: taskId,
        title: 'Test Task',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });

      // Acquire lease with very short TTL
      leaseRepo.acquire(taskId, 'agent', 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const cleaned = leaseRepo.cleanupExpired();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const afterCleanup = leaseRepo.get(taskId);
      expect(afterCleanup).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should handle complete orchestrator flow', () => {
      const taskId = 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C';

      // Create task and initial state
      const task = taskRepo.create({
        id: taskId,
        title: 'Integration Test',
        acceptance_criteria: ['test'],
        scope: 'minor',
        status: 'po'
      });
      const state = stateRepo.create(taskId);

      // Acquire lease and run PO
      const lease = leaseRepo.acquire(taskId, 'po', 300);
      eventRepo.append(taskId, 'handoff', { to_agent: 'po' });

      // Update state after PO
      const poState = stateRepo.update(taskId, state.rev, {
        current: 'arch',
        last_agent: 'po'
      });

      // Release lease
      leaseRepo.release(taskId, lease.lease_id);

      // Verify final state
      const finalState = stateRepo.get(taskId);
      expect(finalState?.current).toBe('arch');
      expect(finalState?.last_agent).toBe('po');

      // Check events
      const events = eventRepo.getByTaskId(taskId);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('handoff');
    });
  });
});