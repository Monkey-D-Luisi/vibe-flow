import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as spawnModule from '@openclaw/quality-contracts/exec/spawn';
import { runTestsTool } from '../src/tools/run_tests.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('runTestsTool integration', () => {
    it('correctly parses real Vitest JSON fixture output', async () => {
        // Read the real fixture from disk
        const fixturePath = path.join(__dirname, 'fixtures', 'vitest-output.json');
        const fixtureOutput = fs.readFileSync(fixturePath, 'utf8');

        // Mock safeSpawn to return the real fixture string
        const safeSpawnSpy = vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue({
            stdout: fixtureOutput,
            stderr: '',
            exitCode: 1, // Vitest exits with 1 if there are failures
            durationMs: 400,
            timedOut: false,
            stdoutTruncated: false,
            stderrTruncated: false,
        });

        const result = await runTestsTool({ reporter: 'vitest' });

        expect(safeSpawnSpy).toHaveBeenCalled();
        expect(result.exitCode).toBe(1);
        expect(result.success).toBe(false);

        expect(result.summary?.totalTests).toBe(2);
        expect(result.summary?.passed).toBe(1);
        expect(result.summary?.failed).toBe(1);

        // Verify parser extracted specific test results
        expect(result.summary?.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    file: 'src/math.test.ts',
                    status: 'passed',
                }),
                expect.objectContaining({
                    file: 'src/failing.test.ts',
                    status: 'failed',
                    tests: expect.arrayContaining([
                        expect.objectContaining({
                            status: 'failed'
                        })
                    ])
                }),
            ])
        );
    });
});
