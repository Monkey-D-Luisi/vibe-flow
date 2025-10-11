import fs from "node:fs";
import path from "node:path";

const coveragePath = "./services/task-mcp/coverage/coverage-final.json";

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf("--output");
const outputPath = outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : undefined;

if (outputFlagIndex >= 0 && (!outputPath || outputPath.startsWith("--"))) {
  console.error("Invalid --output flag usage. Provide a file path.");
  process.exit(1);
}

if (!fs.existsSync(coveragePath)) {
  console.error("Coverage file not found. Run tests with --coverage first.");
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));

let totalStatements = 0;
let coveredStatements = 0;

for (const filePath of Object.keys(coverage)) {
  const fileCoverage = coverage[filePath];
  if (!fileCoverage?.s) {
    continue;
  }
  for (const statementId of Object.keys(fileCoverage.s)) {
    totalStatements += 1;
    if (fileCoverage.s[statementId] > 0) {
      coveredStatements += 1;
    }
  }
}

const coveragePct = totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;

const scope = process.env.SCOPE || "minor";
const isMajor = scope === "major";
const minCoverage = isMajor ? 80 : 70;
const passed = coveragePct >= minCoverage;

const summary = {
  scope,
  required: minCoverage,
  coverage: Number(coveragePct.toFixed(2)),
  statements: {
    covered: coveredStatements,
    total: totalStatements
  },
  passed
};

const summaryText = [
  `Coverage: ${summary.coverage.toFixed(2)}% (required: ${summary.required}%)`,
  `Scope: ${summary.scope}`,
  `Statements: ${summary.statements.covered}/${summary.statements.total}`
].join("\n");

console.log(summaryText);

if (process.env.GITHUB_OUTPUT) {
  const outputData = [
    `coverage=${summary.coverage.toFixed(2)}`,
    `required=${summary.required.toFixed(2)}`,
    `passed=${passed ? "true" : "false"}`,
    `scope=${summary.scope}`,
    `covered_statements=${summary.statements.covered}`,
    `total_statements=${summary.statements.total}`
  ].join("\n");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputData}\n`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const table = [
    "| Metric | Value |",
    "| --- | --- |",
    `| Status | ${passed ? "PASS" : "FAIL"} |`,
    `| Coverage | ${summary.coverage.toFixed(2)}% |`,
    `| Required | ${summary.required.toFixed(2)}% |`,
    `| Statements | ${summary.statements.covered}/${summary.statements.total} |`,
    `| Scope | ${summary.scope} |`
  ].join("\n");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
}

if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(summary, null, 2));
}

if (!passed) {
  console.error(
    `Coverage ${summary.coverage.toFixed(2)}% is below required ${summary.required.toFixed(2)}% for ${summary.scope} scope`
  );
  process.exit(1);
}

console.log(`Coverage check passed`);