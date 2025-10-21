#!/usr/bin/env node

/**
 * Security Audit Script
 * 
 * This script performs a comprehensive security audit of the project,
 * checking for vulnerabilities in dependencies and generating a report.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIT_REPORT_PATH = "./audit-report.json";

console.log("=".repeat(60));
console.log("Starting Security Audit");
console.log("=".repeat(60));
console.log("");

// Function to execute command and capture output
function executeCommand(command, description) {
  console.log(`Running: ${description}`);
  console.log(`Command: ${command}`);
  console.log("-".repeat(60));
  
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    console.log(output);
    return { success: true, output, error: null };
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    if (error.stdout) {
      console.log(error.stdout.toString());
    }
    if (error.stderr) {
      console.error(error.stderr.toString());
    }
    return { success: false, output: error.stdout?.toString(), error: error.message };
  }
}

// Audit results container
const auditResults = {
  timestamp: new Date().toISOString(),
  checks: []
};

console.log("\n1. Checking pnpm version...\n");
const pnpmVersionResult = executeCommand("pnpm --version", "Check pnpm version");
auditResults.checks.push({
  name: "pnpm version",
  ...pnpmVersionResult
});

console.log("\n2. Running pnpm audit...\n");
const auditResult = executeCommand("pnpm audit --json || true", "Security audit of dependencies");
auditResults.checks.push({
  name: "pnpm audit",
  ...auditResult
});

// Try to parse audit results
if (auditResult.output) {
  try {
    const auditData = JSON.parse(auditResult.output);
    console.log("\nAudit Summary:");
    console.log(`- Total advisories: ${auditData.metadata?.vulnerabilities ? Object.values(auditData.metadata.vulnerabilities).reduce((a, b) => a + b, 0) : "N/A"}`);
    if (auditData.metadata?.vulnerabilities) {
      console.log(`  - Critical: ${auditData.metadata.vulnerabilities.critical || 0}`);
      console.log(`  - High: ${auditData.metadata.vulnerabilities.high || 0}`);
      console.log(`  - Moderate: ${auditData.metadata.vulnerabilities.moderate || 0}`);
      console.log(`  - Low: ${auditData.metadata.vulnerabilities.low || 0}`);
    }
  } catch (e) {
    console.log("Could not parse audit JSON output");
  }
}

console.log("\n3. Checking outdated packages...\n");
const outdatedResult = executeCommand("pnpm outdated || true", "Check for outdated packages");
auditResults.checks.push({
  name: "outdated packages",
  ...outdatedResult
});

console.log("\n4. Listing installed packages...\n");
const listResult = executeCommand("pnpm list --depth=0", "List direct dependencies");
auditResults.checks.push({
  name: "package list",
  ...listResult
});

// Save audit report
console.log("\n" + "=".repeat(60));
console.log("Saving audit report...");
console.log("=".repeat(60));

try {
  fs.writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(auditResults, null, 2));
  console.log(`\nAudit report saved to: ${path.resolve(AUDIT_REPORT_PATH)}`);
} catch (error) {
  console.error(`Failed to save audit report: ${error.message}`);
}

console.log("\n" + "=".repeat(60));
console.log("Security Audit Complete");
console.log("=".repeat(60));

// Exit with appropriate code
const hasErrors = auditResults.checks.some(check => !check.success);
if (hasErrors) {
  console.log("\n⚠️  Some checks encountered errors. Please review the output above.");
  process.exit(1);
} else {
  console.log("\n✓ All checks completed successfully");
  process.exit(0);
}
