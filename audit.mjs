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

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIT_REPORT_PATH = "./audit-report.json";

/**
 * Cross-platform command runner using spawnSync without shell.
 * @param {string} command - The command to run (e.g., "pnpm")
 * @param {string[]} args - Command arguments
 * @param {string} description - Human-readable description for logging
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function run(command, args, description) {
  console.log(`Running: ${description}`);
  console.log(`Command: ${command} ${args.join(" ")}`);
  console.log("-".repeat(60));
  
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });
  
  // Handle ENOENT (command not found) and other spawn errors
  if (result.error) {
    return {
      exitCode: -1,
      stdout: "",
      stderr: result.error.message || String(result.error),
    };
  }
  
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Safe JSON parse helper that handles arrays and objects.
 * @param {string} text - JSON text to parse
 * @returns {any|null} Parsed JSON or null if invalid
 */
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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

/**
 * Handler for pnpm version check
 */
function checkPnpmVersion() {
  const result = run("pnpm", ["--version"], "Check pnpm version");
  
  if (result.exitCode === 0) {
    console.log(result.stdout);
    return { success: true, output: result.stdout, error: null };
  } else {
    console.error(`Error: Command failed with exit code ${result.exitCode}`);
    if (result.stderr) {
      console.error(result.stderr);
    }
    return { 
      success: false, 
      output: result.stdout, 
      error: `Command failed with exit code ${result.exitCode}: ${result.stderr}` 
    };
  }
}

/**
 * Handler for pnpm audit
 */
function checkPnpmAudit() {
  const result = run("pnpm", ["audit", "--json"], "Security audit of dependencies");
  
  // Exit code 0: No vulnerabilities
  if (result.exitCode === 0) {
    console.log(result.stdout);
    console.log("\n✓ No vulnerabilities found");
    return { success: true, output: result.stdout, error: null };
  }
  
  // Exit code 1: Vulnerabilities detected (not a command failure)
  if (result.exitCode === 1) {
    console.log(result.stdout);
    
    const auditData = safeParseJSON(result.stdout);
    if (auditData && auditData.metadata && auditData.metadata.vulnerabilities) {
      const vulns = auditData.metadata.vulnerabilities;
      const total = Object.values(vulns).reduce((a, b) => a + b, 0);
      
      console.log("\n⚠️  Vulnerabilities detected:");
      console.log(`- Total advisories: ${total}`);
      console.log(`  - Critical: ${vulns.critical || 0}`);
      console.log(`  - High: ${vulns.high || 0}`);
      console.log(`  - Moderate: ${vulns.moderate || 0}`);
      console.log(`  - Low: ${vulns.low || 0}`);
      
      return { 
        success: false, 
        output: result.stdout, 
        error: `Found ${total} vulnerabilities (critical: ${vulns.critical || 0}, high: ${vulns.high || 0}, moderate: ${vulns.moderate || 0}, low: ${vulns.low || 0})` 
      };
    } else {
      // JSON parse failed but exit code is 1
      console.log("\n⚠️  Vulnerabilities detected (unable to parse details)");
      return { 
        success: false, 
        output: result.stdout, 
        error: "Vulnerabilities detected but could not parse JSON output" 
      };
    }
  }
  
  // Other exit codes: Real command failure
  console.error(`Error: Command failed with exit code ${result.exitCode}`);
  if (result.stderr) {
    console.error(result.stderr);
  }
  return { 
    success: false, 
    output: result.stdout, 
    error: `Command failed with exit code ${result.exitCode}: ${result.stderr}` 
  };
}

/**
 * Handler for pnpm outdated
 */
function checkPnpmOutdated() {
  const result = run("pnpm", ["outdated", "--json"], "Check for outdated packages");
  
  // Exit code 0: All packages up to date
  if (result.exitCode === 0) {
    console.log(result.stdout || "All packages are up to date");
    return { success: true, output: result.stdout, error: null };
  }
  
  // Exit code 1: Outdated packages detected (not a command failure)
  if (result.exitCode === 1) {
    console.log(result.stdout);
    
    const outdatedData = safeParseJSON(result.stdout);
    let count = 0;
    
    if (outdatedData) {
      // Handle array format
      if (Array.isArray(outdatedData)) {
        count = outdatedData.length;
      }
      // Handle object format (keyed by package name)
      else if (outdatedData !== null && typeof outdatedData === 'object') {
        count = Object.keys(outdatedData).length;
      }
      
      console.log(`\n⚠️  Found ${count} outdated package(s)`);
      return { 
        success: false, 
        output: result.stdout, 
        error: `Found ${count} outdated package(s)` 
      };
    } else {
      // JSON parse failed but exit code is 1
      console.log("\n⚠️  Outdated packages detected (unable to parse details)");
      return { 
        success: false, 
        output: result.stdout, 
        error: "Outdated packages detected but could not parse JSON output" 
      };
    }
  }
  
  // Other exit codes: Real command failure
  console.error(`Error: Command failed with exit code ${result.exitCode}`);
  if (result.stderr) {
    console.error(result.stderr);
  }
  return { 
    success: false, 
    output: result.stdout, 
    error: `Command failed with exit code ${result.exitCode}: ${result.stderr}` 
  };
}

/**
 * Handler for pnpm list
 */
function checkPnpmList() {
  const result = run("pnpm", ["list", "--depth=0"], "List direct dependencies");
  
  if (result.exitCode === 0) {
    console.log(result.stdout);
    return { success: true, output: result.stdout, error: null };
  } else {
    console.error(`Error: Command failed with exit code ${result.exitCode}`);
    if (result.stderr) {
      console.error(result.stderr);
    }
    return { 
      success: false, 
      output: result.stdout, 
      error: `Command failed with exit code ${result.exitCode}: ${result.stderr}` 
    };
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
const pnpmVersionResult = checkPnpmVersion();
auditResults.securityChecks.push({
  name: "pnpm version",
  ...pnpmVersionResult
});

console.log("\n2. Running pnpm audit...\n");
const auditResult = checkPnpmAudit();
auditResults.securityChecks.push({
  name: "pnpm audit",
  ...auditResult
});

console.log("\n3. Checking outdated packages...\n");
const outdatedResult = checkPnpmOutdated();
auditResults.securityChecks.push({
  name: "outdated packages",
  ...outdatedResult
});

console.log("\n4. Listing installed packages...\n");
const listResult = checkPnpmList();
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
const hasErrors = auditResults.securityChecks.some(check => check.success === false);
if (hasErrors) {
  console.log("\n⚠️  Some checks encountered errors or found issues. Please review the output above.");
  process.exit(1);
} else {
  console.log("\n✓ All checks completed successfully");
  process.exit(0);
}
