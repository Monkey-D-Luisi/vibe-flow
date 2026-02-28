import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as spawnModule from '@openclaw/quality-contracts/exec/spawn';
import { lintTool } from '../src/tools/lint.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('lintTool integration', () => {
    it('correctly parses real ESLint JSON fixture output', async () => {
        // Read the real fixture from disk
        const fixturePath = path.join(__dirname, 'fixtures', 'eslint-output.json');
        const fixtureOutput = fs.readFileSync(fixturePath, 'utf8');

        // Mock safeSpawn to return the real fixture string
        const safeSpawnSpy = vi.spyOn(spawnModule, 'safeSpawn').mockResolvedValue({
            stdout: fixtureOutput,
            stderr: '',
            exitCode: 1, // ESLint exits with 1 if there are errors
            durationMs: 150,
            timedOut: false,
            stdoutTruncated: false,
            stderrTruncated: false,
        });

        const result = await lintTool({ engine: 'eslint' });

        expect(safeSpawnSpy).toHaveBeenCalled();
        expect(result.exitCode).toBe(1);
        expect(result.totalErrors).toBe(1);
        expect(result.totalWarnings).toBe(1);
        expect(result.totalFiles).toBe(2);
        expect(result.filesWithIssues).toBe(1);

        // Verify parser correctly extracted the messages
        const offendingFile = result.reports.find((r) => r.file === '/app/src/index.ts');
        expect(offendingFile).toBeDefined();
        expect(offendingFile?.errors).toBe(1);
        expect(offendingFile?.warnings).toBe(1);

        expect(offendingFile?.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    ruleId: 'no-unused-vars',
                    severity: 'warning',
                    line: 10,
                }),
                expect.objectContaining({
                    ruleId: 'semi',
                    severity: 'error',
                    line: 12,
                }),
            ])
        );
    });
});
