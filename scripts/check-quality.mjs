import fs from "node:fs";
import path from "node:path";

const coveragePath = "./services/task-mcp/coverage/coverage-final.json";

// Check if coverage file exists
if (!fs.existsSync(coveragePath)) {
  console.error("Coverage file not found. Run tests with --coverage first.");
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));

// Calculate total coverage from vitest coverage-final.json format
let totalStatements = 0;
let coveredStatements = 0;

for (const filePath in coverage) {
  const fileCoverage = coverage[filePath];
  if (fileCoverage.s) {
    for (const statementId in fileCoverage.s) {
      totalStatements++;
      if (fileCoverage.s[statementId] > 0) {
        coveredStatements++;
      }
    }
  }
}

const lines = totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;

// Get scope from environment or package.json
const scope = process.env.SCOPE || "minor";
const isMajor = scope === "major";
const minCoverage = isMajor ? 80 : 70;

console.log(`Coverage: ${lines.toFixed(2)}% (required: ${minCoverage}%)`);
console.log(`Scope: ${scope}`);
console.log(`Statements: ${coveredStatements}/${totalStatements}`);

if (lines < minCoverage) {
  console.error(`❌ Coverage ${lines.toFixed(2)}% < ${minCoverage}% required for ${scope} scope`);
  process.exit(1);
}

console.log(`✅ Coverage check passed: ${lines.toFixed(2)}% >= ${minCoverage}%`);