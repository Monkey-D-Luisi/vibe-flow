import { describe, it, expect } from 'vitest';
import { safeSpawn } from '../src/exec/spawn.js';

describe('safeSpawn', () => {
  it('should capture failure details on invalid command', async () => {
    const result = await safeSpawn('invalidcommand', []);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toHaveLength(0);
  });

  // More tests would require mocking child_process, which is complex
  // For now, basic test
});
