import escomplex from 'typhonjs-escomplex';
import { transpileModule, ModuleKind, ScriptTarget, JsxEmit } from 'typescript';
import { readFileSafe } from '../fs/read.js';
import type { ComplexityUnit, FileComplexity, ComplexityUnitKind } from './types.js';

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toInteger(value: unknown, fallback: number): number {
  const num = toNumber(value);
  const int = Math.trunc(num);
  return Number.isFinite(int) && int > 0 ? int : fallback;
}

function deriveMethodKind(name: string, isClassMethod: boolean): ComplexityUnitKind {
  if (isClassMethod) {
    return 'method';
  }
  if (name.startsWith('<anon')) {
    return 'arrow';
  }
  return 'function';
}

function createMethodUnit(
  method: any,
  kind: ComplexityUnitKind,
  fallbackName: string
): ComplexityUnit {
  const name = typeof method?.name === 'string' && method.name.trim().length > 0 ? method.name : fallbackName;
  return {
    name,
    kind,
    cyclomatic: toNumber(method?.cyclomatic),
    startLine: toInteger(method?.lineStart, 1),
    endLine: toInteger(method?.lineEnd, toInteger(method?.lineStart, 1)),
    loc: toNumber(method?.sloc?.logical),
    params: toNumber(method?.paramCount)
  };
}

export async function analyzeWithEscomplex(path: string): Promise<FileComplexity> {
  const source = await readFileSafe(path);

  let report: any;
  try {
    const transpiled = transpileModule(source, {
      compilerOptions: {
        target: ScriptTarget.ES2020,
        module: ModuleKind.ESNext,
        jsx: JsxEmit.Preserve
      }
    });
    const normalized = transpiled.outputText ?? source;
    report = escomplex.analyzeModule(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PARSE_ERROR: ${message}`);
  }

  if (Array.isArray(report?.errors) && report.errors.length > 0) {
    const first = report.errors[0];
    const message = typeof first?.message === 'string' ? first.message : 'Unknown parser error';
    throw new Error(`PARSE_ERROR: ${message}`);
  }

  const units: ComplexityUnit[] = [];

  if (Array.isArray(report?.classes)) {
    for (const cls of report.classes) {
      if (Array.isArray(cls?.methods)) {
        for (const method of cls.methods) {
          units.push(createMethodUnit(method, deriveMethodKind(String(method?.name ?? ''), true), '<class method>'));
        }
      }
    }
  }

  if (Array.isArray(report?.methods)) {
    for (const method of report.methods) {
      units.push(createMethodUnit(method, deriveMethodKind(String(method?.name ?? ''), false), '<function>'));
    }
  }

  return { path, units };
}
