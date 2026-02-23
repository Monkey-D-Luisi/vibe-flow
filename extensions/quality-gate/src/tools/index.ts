/**
 * Quality gate tool index.
 *
 * Re-exports all quality gate tools for registration.
 */

export { complexityTool, complexityToolDef, type ComplexityInput, type ComplexityOutput } from './complexity.js';
export { coverageReportTool, coverageReportToolDef, type CoverageInput, type CoverageOutput } from './coverage_report.js';
export { lintTool, lintToolDef, type LintInput, type LintOutput } from './lint.js';
export { runTestsTool, runTestsToolDef, type RunTestsInput, type RunTestsOutput } from './run_tests.js';
export { gateEnforceTool, gateEnforceToolDef, type GateEnforceInput, type GateEnforceOutput } from './gate_enforce.js';

import { complexityToolDef } from './complexity.js';
import { coverageReportToolDef } from './coverage_report.js';
import { lintToolDef } from './lint.js';
import { runTestsToolDef } from './run_tests.js';
import { gateEnforceToolDef } from './gate_enforce.js';

/**
 * Get all quality gate tool definitions.
 */
export function getAllToolDefs() {
  return [
    complexityToolDef,
    coverageReportToolDef,
    lintToolDef,
    runTestsToolDef,
    gateEnforceToolDef,
  ];
}
