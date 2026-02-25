export type LintSeverity = 'error' | 'warning' | 'info';

export interface NormalizedLintMessage {
  ruleId: string | null;
  severity: LintSeverity;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface NormalizedLintFileReport {
  file: string;
  errors: number;
  warnings: number;
  messages: NormalizedLintMessage[];
}
