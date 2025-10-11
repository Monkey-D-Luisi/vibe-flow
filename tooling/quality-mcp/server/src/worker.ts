import { stdin, stdout, stderr, exit } from 'node:process';
import { URL } from 'node:url';

type ToolName =
  | 'quality.run_tests'
  | 'quality.coverage_report'
  | 'quality.lint'
  | 'quality.complexity';

type ToolHandler = (input: unknown) => Promise<unknown>;

async function loadTool(name: ToolName): Promise<ToolHandler> {
  const roots = [
    new URL('../dist/tools/', import.meta.url),
    new URL('../../src/tools/', import.meta.url)
  ];

  let lastError: unknown;

  for (const root of roots) {
    try {
      switch (name) {
        case 'quality.run_tests':
          return (await import(new URL('run_tests.js', root).href)).runTests;
        case 'quality.coverage_report':
          return (await import(new URL('coverage_report.js', root).href)).coverageReport;
        case 'quality.lint':
          return (await import(new URL('lint.js', root).href)).lint;
        case 'quality.complexity':
          return (await import(new URL('complexity.js', root).href)).complexity;
        default:
          throw new Error(`Unknown tool ${name satisfies never}`);
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to load tool');
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
