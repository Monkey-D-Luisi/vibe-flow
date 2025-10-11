export type ComplexityUnitKind = 'function' | 'method' | 'class' | 'arrow' | 'getter' | 'setter';

export interface ComplexityUnit {
  name: string;
  kind: ComplexityUnitKind;
  cyclomatic: number;
  startLine: number;
  endLine: number;
  loc?: number;
  params?: number;
}

export interface FileComplexity {
  path: string;
  units: ComplexityUnit[];
}
