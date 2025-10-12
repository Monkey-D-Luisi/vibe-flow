import { TaskRepository } from '../../../repo/repository.js';
import { StateRepository, EventRepository, LeaseRepository } from '../../../repo/state.js';

// Singleton repository instances shared across all handlers
export const repo = new TaskRepository();
export const stateRepo = new StateRepository(repo.database);
export const eventRepo = new EventRepository(repo.database);
export const leaseRepo = new LeaseRepository(repo.database);
