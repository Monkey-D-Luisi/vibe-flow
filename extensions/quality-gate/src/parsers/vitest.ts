/**
 * Vitest JSON reporter output parser.
 */

export interface VitestTestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'todo';
  duration: number;
  errors?: string[];
}

export interface VitestFileResult {
  file: string;
  tests: VitestTestResult[];
  status: 'passed' | 'failed';
  duration: number;
}

export interface VitestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  totalDuration: number;
  success: boolean;
  files: VitestFileResult[];
}

interface VitestRawTestCase {
  name?: string;
  fullName?: string;
  status?: string;
  duration?: number;
  errors?: Array<{ message?: string; stack?: string }>;
}

interface VitestRawFileResult {
  name?: string;
  filepath?: string;
  status?: string;
  duration?: number;
  assertionResults?: VitestRawTestCase[];
  testResults?: VitestRawTestCase[];
}

interface VitestRawOutput {
  success?: boolean;
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: VitestRawFileResult[];
}

function mapTestStatus(status: string | undefined): VitestTestResult['status'] {
  switch (status) {
    case 'passed':
    case 'pass':
      return 'passed';
    case 'failed':
    case 'fail':
      return 'failed';
    case 'skipped':
    case 'pending':
    case 'disabled':
      return 'skipped';
    case 'todo':
      return 'todo';
    default:
      return 'skipped';
  }
}

/**
 * Parse Vitest JSON reporter output.
 */
export function parseVitestOutput(jsonString: string): VitestSummary {
  let raw: VitestRawOutput;
  try {
    raw = JSON.parse(jsonString) as VitestRawOutput;
  } catch {
    throw new Error('PARSE_ERROR: Failed to parse Vitest JSON output');
  }

  const files: VitestFileResult[] = [];
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let totalDuration = 0;

  const rawFiles = raw.testResults || [];
  for (const rawFile of rawFiles) {
    const testCases = rawFile.assertionResults || rawFile.testResults || [];
    const tests: VitestTestResult[] = testCases.map((tc) => {
      const status = mapTestStatus(tc.status);
      const result: VitestTestResult = {
        name: tc.fullName || tc.name || 'unknown',
        status,
        duration: tc.duration || 0,
      };
      if (tc.errors && tc.errors.length > 0) {
        result.errors = tc.errors.map((e) => e.message || e.stack || 'Unknown error');
      }
      return result;
    });

    const fileDuration = rawFile.duration || 0;
    const fileStatus = rawFile.status === 'failed' ? 'failed' : 'passed';

    for (const test of tests) {
      totalTests++;
      switch (test.status) {
        case 'passed':
          passed++;
          break;
        case 'failed':
          failed++;
          break;
        case 'skipped':
        case 'todo':
          skipped++;
          break;
      }
    }

    totalDuration += fileDuration;
    files.push({
      file: rawFile.filepath || rawFile.name || 'unknown',
      tests,
      status: fileStatus as 'passed' | 'failed',
      duration: fileDuration,
    });
  }

  // Fallback to raw counts if available
  if (totalTests === 0 && raw.numTotalTests) {
    totalTests = raw.numTotalTests;
    passed = raw.numPassedTests || 0;
    failed = raw.numFailedTests || 0;
    skipped = raw.numPendingTests || 0;
  }

  return {
    totalTests,
    passed,
    failed,
    skipped,
    totalDuration,
    success: raw.success !== false && failed === 0,
    files,
  };
}
