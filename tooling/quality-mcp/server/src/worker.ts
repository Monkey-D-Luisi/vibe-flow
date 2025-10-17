import { stdin, stdout, stderr, exit, cwd } from 'node:process';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { ToolName } from './toolNames.js';

type ToolHandler = (input: unknown) => Promise<unknown>;

function resolveToolModule(tool: ToolName): string {
  // Resolve from current working directory (which should be workspace root when server starts)
  const toolsDir = resolve(cwd(), 'tooling/quality-mcp/src/tools');
  const map: Record<ToolName, string> = {
    'quality.run_tests': join(toolsDir, 'run_tests.ts'),
    'quality.coverage_report': join(toolsDir, 'coverage_report.ts'),
    'quality.lint': join(toolsDir, 'lint.ts'),
    'quality.complexity': join(toolsDir, 'complexity.ts')
  };
  const target = map[tool];
  if (!target) throw new Error(`Unsupported tool ${tool}`);
  return pathToFileURL(target).href; // ESM-safe
}

async function loadTool(name: ToolName): Promise<ToolHandler> {
  const modulePath = resolveToolModule(name);
  const mod = await import(modulePath);
  return mod.runTests || mod.coverageReport || mod.lint || mod.complexity;
}

interface WorkerPayload {
  tool: ToolName;
  input: unknown;
}

async function readPayload(): Promise<WorkerPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw) as WorkerPayload;
}

async function main() {
  try {
    const payload = await readPayload();
    const handler = await loadTool(payload.tool);
    const result = await handler(payload.input);
    stdout.write(JSON.stringify({ ok: true, result }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stdout.write(JSON.stringify({ ok: false, error: { code: 'RUNNER_ERROR', message } }));
  }
}

main().catch((err) => {
  stderr.write(err instanceof Error ? err.stack ?? err.message : String(err));
  exit(1);
});
