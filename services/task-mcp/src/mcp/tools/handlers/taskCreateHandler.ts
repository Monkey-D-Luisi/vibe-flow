import { ulid } from 'ulid';
import { repo, stateRepo } from './sharedRepos.js';

export async function handleTaskCreate(input: unknown): Promise<any> {
  // Input is already validated by MCP SDK using toolInputSchemas
  const args = input as {
    title: string;
    description?: string;
    acceptance_criteria: string[];
    scope: 'minor' | 'major';
    tags?: string[];
    links?: any;
  };

  const record = repo.create({
    id: `TR-${ulid()}`,
    title: args.title,
    description: args.description,
    acceptance_criteria: args.acceptance_criteria,
    scope: args.scope,
    status: 'po',
    tags: args.tags ?? [],
    links: args.links ?? {}
  });
  stateRepo.create(record.id);
  return record;
}