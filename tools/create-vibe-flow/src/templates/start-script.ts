/**
 * Start script templates (EP30 Task 0191)
 */

export function renderStartSh(projectName: string): string {
  return `#!/usr/bin/env bash
# Start ${projectName} with OpenClaw gateway
set -euo pipefail

export OPENCLAW_CONFIG_PATH="./openclaw.json"
npx openclaw gateway run "$@"
`;
}

export function renderStartPs1(projectName: string): string {
  return `# Start ${projectName} with OpenClaw gateway
$ErrorActionPreference = "Stop"

$env:OPENCLAW_CONFIG_PATH = "./openclaw.json"
npx openclaw gateway run @args
`;
}
