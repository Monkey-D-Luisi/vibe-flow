export type ToolName =
  | 'quality.run_tests'
  | 'quality.coverage_report'
  | 'quality.lint'
  | 'quality.complexity';

export const TOOL_NAMES: ToolName[] = [
  'quality.run_tests',
  'quality.coverage_report',
  'quality.lint',
  'quality.complexity'
];
