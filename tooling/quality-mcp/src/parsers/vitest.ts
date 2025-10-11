interface VitestJson {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  startTime: number;
  endTime?: number;
  success: boolean;
  testResults: Array<{
    name: string;
    status: string;
    assertionResults: Array<{
      title: string;
      status: string;
    }>;
  }>;
}

export interface ParsedTestResult {
  total: number;
  passed: number;
  failed: number;
  failedTests: string[];
  durationMs: number;
}

/**
 * Parse Vitest JSON output and extract test results
 */
export function parseVitestOutput(jsonStr: string): ParsedTestResult {
  let data: VitestJson;
  try {
    data = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('PARSE_ERROR: Invalid JSON output from Vitest');
  }

  const { numTotalTests, numPassedTests, numFailedTests, startTime, endTime, testResults } = data;

  // Calculate duration
  const durationMs = endTime ? endTime - startTime : Date.now() - startTime;

  // Collect failed tests
  const failedTests: string[] = [];
  for (const suite of testResults) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status !== 'passed') {
        failedTests.push(`${suite.name} :: ${assertion.title}`);
      }
    }
  }

  return {
    total: numTotalTests,
    passed: numPassedTests,
    failed: numFailedTests,
    failedTests,
    durationMs: Math.max(0, Math.round(durationMs)), // Ensure non-negative
  };
}