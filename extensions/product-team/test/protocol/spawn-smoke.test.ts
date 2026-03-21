/**
 * Spawn Smoke Tests
 *
 * Verify that agent spawn dispatch contains no legacy SDK internal references.
 * EP13 Task 0098
 */

import { describe, it, expect } from 'vitest';
import { dispatchAgentSpawn } from '../../src/hooks/auto-spawn.js';

const ALL_AGENTS = ['pm', 'tech-lead', 'po', 'designer', 'back-1', 'front-1', 'qa', 'devops'];

describe('spawn smoke', () => {
  it('dispatchAgentSpawn does not throw for any agent', () => {
    const logger = { info: () => {}, warn: () => {} };
    for (const agentId of ALL_AGENTS) {
      expect(() => dispatchAgentSpawn(agentId, 'Hello', logger)).not.toThrow();
    }
  });

  it('source code contains no clientMod references', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const autoSpawnPath = path.resolve(import.meta.dirname, '../../src/hooks/auto-spawn.ts');
    const source = fs.readFileSync(autoSpawnPath, 'utf-8');

    expect(source).not.toContain('clientMod');
    expect(source).not.toContain('OPENCLAW_SPAWN_V1');
    expect(source).not.toContain('fireAgentViaGatewayWsV1');
  });

  it('source code does not access minified SDK exports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const autoSpawnPath = path.resolve(import.meta.dirname, '../../src/hooks/auto-spawn.ts');
    const source = fs.readFileSync(autoSpawnPath, 'utf-8');

    // Minified SDK patterns from legacy v1
    expect(source).not.toMatch(/clientMod\.\w+/);
    expect(source).not.toMatch(/\.kt\b/);
    expect(source).not.toMatch(/\.Xt\b/);
  });
});
