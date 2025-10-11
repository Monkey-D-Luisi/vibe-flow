import { describe, it, expect } from 'vitest';
import { parseVitestOutput } from '../src/parsers/vitest.js';

describe('parseVitestOutput', () => {
  it('should parse valid Vitest JSON output', () => {
    const jsonStr = JSON.stringify({
      numTotalTests: 10,
      numPassedTests: 8,
      numFailedTests: 2,
      startTime: 1000,
      endTime: 2000,
      success: false,
      testResults: [
        {
          name: 'suite1',
          status: 'failed',
          assertionResults: [
            { title: 'test1', status: 'passed' },
            { title: 'test2', status: 'failed' }
          ]
        },
        {
          name: 'suite2',
          status: 'passed',
          assertionResults: [
            { title: 'test3', status: 'passed' }
          ]
        }
      ]
    });

    const result = parseVitestOutput(jsonStr);

    expect(result).toEqual({
      total: 10,
      passed: 8,
      failed: 2,
      failedTests: ['suite1 :: test2'],
      durationMs: 1000
    });
  });

  it('should calculate duration without endTime', () => {
    const startTime = Date.now() - 500;
    const jsonStr = JSON.stringify({
      numTotalTests: 5,
      numPassedTests: 5,
      numFailedTests: 0,
      startTime,
      success: true,
      testResults: []
    });

    const result = parseVitestOutput(jsonStr);

    expect(result.durationMs).toBeGreaterThanOrEqual(500);
    expect(result.durationMs).toBeLessThanOrEqual(600); // Allow some margin
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseVitestOutput('invalid json')).toThrow('PARSE_ERROR');
  });
});