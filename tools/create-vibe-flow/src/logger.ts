/**
 * Logger with ANSI colors (zero dependencies) (EP30 Task 0191)
 */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const useColor = process.stdout.isTTY !== false && !process.env['NO_COLOR'];

function colorize(color: string, text: string): string {
  return useColor ? `${color}${text}${RESET}` : text;
}

export function info(message: string): void {
  console.log(colorize(CYAN, '  info ') + message);
}

export function success(message: string): void {
  console.log(colorize(GREEN, '  ✓ ') + message);
}

export function warn(message: string): void {
  console.log(colorize(YELLOW, '  ⚠ ') + message);
}

export function error(message: string): void {
  console.error(colorize(RED, '  ✖ ') + message);
}

export function step(label: string, detail?: string): void {
  const msg = detail ? `${colorize(BOLD, label)} ${colorize(DIM, detail)}` : colorize(BOLD, label);
  console.log(`\n${msg}`);
}

export function banner(): void {
  console.log('');
  console.log(colorize(BOLD + CYAN, '  create-vibe-flow'));
  console.log(colorize(DIM, '  Zero-config project scaffolding for OpenClaw'));
  console.log('');
}

export function done(projectName: string, projectDir: string): void {
  console.log('');
  console.log(colorize(GREEN + BOLD, '  Done!') + ` Project created at ${colorize(BOLD, projectDir)}`);
  console.log('');
  console.log('  Next steps:');
  console.log(`    ${colorize(DIM, '$')} cd ${projectName}`);
  console.log(`    ${colorize(DIM, '$')} npm start`);
  console.log('');
}
