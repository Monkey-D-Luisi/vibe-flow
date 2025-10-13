import { stdin, stdout, stderr, exit } from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type ToolName =
  | 'quality.run_tests'
  | 'quality.coverage_report'
  | 'quality.lint'
  | 'quality.complexity';

type ToolHandler = (input: unknown) => Promise<unknown>;

function resolveToolModule(tool: string) {
  const map: Record<string, string> = {
    'quality.run_tests': resolve(__dirname, '../../src/tools/run_tests.ts'),
    'quality.coverage_report': resolve(__dirname, '../../src/tools/coverage_report.ts'),
    'quality.lint': resolve(__dirname, '../../src/tools/lint.ts'),
    'quality.complexity': resolve(__dirname, '../../src/tools/complexity.ts')
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
