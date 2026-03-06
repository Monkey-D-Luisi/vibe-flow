/**
 * Quality gate tool index.
 *
 * Re-exports all quality gate tools for registration.
 */
export { complexityTool, complexityToolDef } from './complexity.js';
export { coverageReportTool, coverageReportToolDef } from './coverage_report.js';
export { lintTool, lintToolDef } from './lint.js';
export { runTestsTool, runTestsToolDef } from './run_tests.js';
export { gateEnforceTool, gateEnforceToolDef } from './gate_enforce.js';
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
