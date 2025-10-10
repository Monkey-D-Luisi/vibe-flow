import fs from "node:fs";
import path from "node:path";

const coveragePath = "./services/task-mcp/coverage/coverage-summary.json";

// Check if coverage file exists
if (!fs.existsSync(coveragePath)) {
  console.error("Coverage file not found. Run tests with --coverage first.");
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
const lines = summary.total.lines.pct;

// Get scope from environment or package.json
const scope = process.env.SCOPE || "minor";
const isMajor = scope === "major";
const minCoverage = isMajor ? 80 : 70;

console.log(`Coverage: ${lines}% (required: ${minCoverage}%)`);
console.log(`Scope: ${scope}`);

if (lines < minCoverage) {
  console.error(`❌ Coverage ${lines}% < ${minCoverage}% required for ${scope} scope`);
  process.exit(1);
}

console.log(`✅ Coverage check passed: ${lines}% >= ${minCoverage}%`);

// Additional checks can be added here
// - Lint errors
// - Test results
// - Other quality gates