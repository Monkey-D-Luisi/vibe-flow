import { describe, it, expect } from 'vitest';
import { safeSpawn } from '../src/exec/spawn.js';

describe('safeSpawn', () => {
  it('should reject on invalid command', async () => {
    await expect(safeSpawn('invalidcommand', [])).rejects.toThrow();
  });

  // More tests would require mocking child_process, which is complex
  // For now, basic test
});