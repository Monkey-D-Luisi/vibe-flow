import { describe, it, expect } from 'vitest';
import { parseVitestOutput } from '../../../src/quality/parsers/vitest.js';

describe('parseVitestOutput', () => {
  it('parses a successful Vitest JSON output', () => {
    const input = JSON.stringify({
      success: true,
      numTotalTests: 5,
      numPassedTests: 5,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          filepath: '/test/index.test.ts',
          status: 'passed',
          duration: 120,
          assertionResults: [
            { fullName: 'should work', status: 'passed', duration: 10 },
            { fullName: 'should also work', status: 'passed', duration: 8 },
          ],
        },
        {
          filepath: '/test/utils.test.ts',
          status: 'passed',
          duration: 80,
          assertionResults: [
            { fullName: 'util adds numbers', status: 'passed', duration: 5 },
            { fullName: 'util formats string', status: 'passed', duration: 3 },
            { fullName: 'util handles null', status: 'passed', duration: 4 },
          ],
        },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.success).toBe(true);
    expect(result.totalTests).toBe(5);
    expect(result.passed).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].file).toBe('/test/index.test.ts');
  });

  it('parses output with failures', () => {
    const input = JSON.stringify({
      success: false,
      testResults: [
        {
          filepath: '/test/fail.test.ts',
          status: 'failed',
          duration: 50,
          assertionResults: [
            { fullName: 'should pass', status: 'passed', duration: 5 },
            {
              fullName: 'should fail',
              status: 'failed',
              duration: 3,
              errors: [{ message: 'Expected true to be false' }],
            },
          ],
        },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.success).toBe(false);
    expect(result.totalTests).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.files[0].status).toBe('failed');
    expect(result.files[0].tests[1].errors).toEqual(['Expected true to be false']);
  });

  it('handles skipped and todo tests', () => {
    const input = JSON.stringify({
      success: true,
      testResults: [
        {
          filepath: '/test/skip.test.ts',
          status: 'passed',
          duration: 30,
          assertionResults: [
            { fullName: 'should run', status: 'passed', duration: 5 },
            { fullName: 'skipped test', status: 'pending', duration: 0 },
            { fullName: 'todo test', status: 'todo', duration: 0 },
          ],
        },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.totalTests).toBe(3);
    expect(result.passed).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it('maps various status strings correctly', () => {
    const input = JSON.stringify({
      success: true,
      testResults: [
        {
          filepath: '/test/statuses.test.ts',
          status: 'passed',
          duration: 10,
          assertionResults: [
            { fullName: 'pass variant', status: 'pass', duration: 1 },
            { fullName: 'fail variant', status: 'fail', duration: 1 },
            { fullName: 'disabled variant', status: 'disabled', duration: 0 },
            { fullName: 'skipped variant', status: 'skipped', duration: 0 },
          ],
        },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.files[0].tests[0].status).toBe('passed');
    expect(result.files[0].tests[1].status).toBe('failed');
    expect(result.files[0].tests[2].status).toBe('skipped');
    expect(result.files[0].tests[3].status).toBe('skipped');
  });

  it('falls back to name when fullName is missing', () => {
    const input = JSON.stringify({
      success: true,
      testResults: [
        {
          filepath: '/test/names.test.ts',
          status: 'passed',
          duration: 10,
          assertionResults: [
            { name: 'short name', status: 'passed', duration: 1 },
          ],
        },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.files[0].tests[0].name).toBe('short name');
  });

  it('falls back to raw counts when no testResults detail', () => {
    const input = JSON.stringify({
      success: true,
      numTotalTests: 10,
      numPassedTests: 8,
      numFailedTests: 1,
      numPendingTests: 1,
      testResults: [],
    });

    const result = parseVitestOutput(input);
    expect(result.totalTests).toBe(10);
    expect(result.passed).toBe(8);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('uses testResults field if assertionResults is absent', () => {
    const input = JSON.stringify({
      success: true,
      testResults: [
        {
          name: '/test/alt.test.ts',
          status: 'passed',
          duration: 10,
          testResults: [
            { fullName: 'alt test', status: 'passed', duration: 5 },
          ],
        },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.files[0].file).toBe('/test/alt.test.ts');
    expect(result.files[0].tests[0].name).toBe('alt test');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseVitestOutput('not json')).toThrow('PARSE_ERROR');
  });

  it('handles empty testResults gracefully', () => {
    const input = JSON.stringify({ success: true });
    const result = parseVitestOutput(input);
    expect(result.totalTests).toBe(0);
    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(0);
  });

  it('computes totalDuration from files', () => {
    const input = JSON.stringify({
      success: true,
      testResults: [
        { filepath: '/a.test.ts', status: 'passed', duration: 100, assertionResults: [] },
        { filepath: '/b.test.ts', status: 'passed', duration: 200, assertionResults: [] },
      ],
    });

    const result = parseVitestOutput(input);
    expect(result.totalDuration).toBe(300);
  });
});
