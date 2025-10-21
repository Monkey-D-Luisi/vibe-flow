#!/usr/bin/env node

/**
 * Comprehensive Project Audit Script
 * 
 * This script performs a comprehensive audit of the project including:
 * - Security vulnerabilities in dependencies
 * - Project structure and configuration
 * - Testing frameworks and coverage
 * - Development tools and practices
 * - CI/CD setup
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIT_REPORT_PATH = "./audit-report.json";

// Utility functions for project structure analysis
const has = (p) => fs.existsSync(path.join(process.cwd(), p));

const find = (dir, exts, hits = []) => {
  if (!fs.existsSync(dir)) return hits;
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      // Skip node_modules and other common large directories
      if (f === "node_modules" || f === ".git" || f === "dist" || f === "build" || f === "coverage") {
        continue;
      }
      try {
        const s = fs.statSync(p);
        if (s.isDirectory()) {
          find(p, exts, hits);
        } else if (exts.some((e) => f.toLowerCase().endsWith(e))) {
          hits.push(p);
        }
      } catch (err) {
        // Skip files we can't read
        continue;
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }
  return hits;
};

const readJSON = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const searchInFiles = (files, patterns) => {
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      if (patterns.some((pattern) => pattern.test(content))) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
};

// Analyze project structure
function analyzeProjectStructure() {
  console.log("\n" + "=".repeat(60));
  console.log("Analyzing Project Structure");
  console.log("=".repeat(60));

  const pkg = readJSON("package.json");
  const tsconfig = readJSON("tsconfig.json");
  
  // Check for various configuration files
  const ci = has(".github/workflows")
    ? fs.readdirSync(".github/workflows").filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    : [];
  
  const openapi = find(".", [".yaml", ".yml", ".json"]).filter((p) =>
    /openapi|swagger/i.test(p)
  );
  const proto = find(".", [".proto"]);
  const tests = find(".", [".test.ts", ".spec.ts", ".test.tsx", ".spec.tsx", ".test.js", ".spec.js"]);
  const pact = find(".", [".pact.ts", ".pact.js", "pact.ts", "pact.test.ts"]).concat(
    find(".", ["pact.json"])
  );
  const e2e = find(".", [".e2e.ts", ".e2e.tsx", ".e2e.js"]);
  
  // Check for testing frameworks
  const playwright = has("playwright.config.ts") || has("playwright.config.js");
  const vitest = has("vitest.config.ts") || has("vitest.config.js") || has("vitest.config.mjs");
  const jest = has("jest.config.ts") || has("jest.config.js");
  
  // Check for TypeScript/JavaScript files
  const srcFiles = find(".", [".ts", ".tsx", ".js", ".jsx"]);
  
  // Check for specific libraries/patterns
  const zod = searchInFiles(srcFiles, [/zod/]);
  const otel = searchInFiles(srcFiles, [
    /@opentelemetry/i,
    /opentelemetry-api/i,
    /opentelemetry\/api/i,
  ]);
  
  // Check for linting and code quality tools
  const lint =
    has(".eslintrc.js") ||
    has(".eslintrc.cjs") ||
    has(".eslintrc.json") ||
    has("eslint.config.js") ||
    has("eslint.config.mjs");
  const prettier = has(".prettierrc") || has(".prettierrc.json") || has("prettier.config.js");
  const commitHooks = has(".husky");
  
  // Check for dependency management
  const depMgmt = has("renovate.json") || has(".github/dependabot.yml");
  
  // Check for containerization
  const docker = has("Dockerfile") || has("docker-compose.yml") || has("compose.yaml");
  
  // Check for environment configuration
  const env = has(".env.example") || has(".env.template");
  
  // Check for error handling patterns
  const errorFmt = searchInFiles(srcFiles, [
    /statusCode/i,
    /errorCode/i,
    /correlation/i,
    /requestId/i,
    /problem\+json/i,
  ]);
  
  // TypeScript strict mode
  const strict = tsconfig && tsconfig.compilerOptions?.strict === true;
  
  // Package.json scripts
  const scripts = pkg?.scripts || {};
  const missingScripts = [];
  const recommendedScripts = ["test", "build", "lint", "dev", "start"];
  recommendedScripts.forEach((script) => {
    if (!scripts[script]) {
      missingScripts.push(script);
    }
  });

  const structureAnalysis = {
    packageName: pkg?.name || "(no package.json found)",
    version: pkg?.version || "N/A",
    description: pkg?.description || "N/A",
    typescript: {
      hasConfig: !!tsconfig,
      strictMode: !!strict,
      compilerOptions: tsconfig?.compilerOptions || null,
    },
    apis: {
      openapi: openapi.length > 0 ? openapi : null,
      protobuf: proto.length > 0 ? proto : null,
    },
    testing: {
      totalTests: tests.length,
      testFiles: tests.length > 0 ? tests.slice(0, 10) : null,
      hasVitest: !!vitest,
      hasJest: !!jest,
      hasPlaywright: !!playwright,
      e2eTests: e2e.length,
      contractTests: pact.length,
    },
    libraries: {
      usesZod: zod,
      usesOpenTelemetry: otel,
    },
    codeQuality: {
      hasLinter: lint,
      hasPrettier: prettier,
      hasCommitHooks: commitHooks,
      hasDependencyManagement: depMgmt,
    },
    infrastructure: {
      hasDocker: docker,
      hasEnvTemplate: env,
      ciWorkflows: ci.length > 0 ? ci : null,
    },
    errorHandling: {
      hasStructuredErrors: errorFmt,
    },
    scripts: {
      available: Object.keys(scripts),
      missing: missingScripts.length > 0 ? missingScripts : null,
    },
  };

  console.log("\nProject Structure Analysis:");
  console.log(JSON.stringify(structureAnalysis, null, 2));
  
  return structureAnalysis;
}

console.log("=".repeat(60));
console.log("Starting Comprehensive Project Audit");
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
  projectStructure: null,
  securityChecks: []
};

// Run project structure analysis
auditResults.projectStructure = analyzeProjectStructure();

console.log("\n" + "=".repeat(60));
console.log("Running Security Checks");
console.log("=".repeat(60));

console.log("\n1. Checking pnpm version...\n");
const pnpmVersionResult = executeCommand("pnpm --version", "Check pnpm version");
auditResults.securityChecks.push({
  name: "pnpm version",
  ...pnpmVersionResult
});

console.log("\n2. Running pnpm audit...\n");
const auditResult = executeCommand("pnpm audit --json || true", "Security audit of dependencies");
auditResults.securityChecks.push({
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
auditResults.securityChecks.push({
  name: "outdated packages",
  ...outdatedResult
});

console.log("\n4. Listing installed packages...\n");
const listResult = executeCommand("pnpm list --depth=0", "List direct dependencies");
auditResults.securityChecks.push({
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
console.log("Comprehensive Project Audit Complete");
console.log("=".repeat(60));

// Exit with appropriate code
const hasErrors = auditResults.securityChecks.some(check => !check.success);
if (hasErrors) {
  console.log("\n⚠️  Some checks encountered errors. Please review the output above.");
  process.exit(1);
} else {
  console.log("\n✓ All checks completed successfully");
  process.exit(0);
}
