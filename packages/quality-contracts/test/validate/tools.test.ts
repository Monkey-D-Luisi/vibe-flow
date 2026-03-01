import { describe, it, expect } from 'vitest';
import {
  assertOptionalString,
  assertOptionalNumber,
  assertOptionalBoolean,
  assertOptionalStringArray,
  assertOptionalStringEnum,
  assertOptionalArray,
  assertOptionalObject,
} from '../../src/validate/tools.js';

describe('assertOptionalString', () => {
  it('accepts string values', () => {
    expect(() => assertOptionalString('hello', 'field')).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalString(undefined, 'field')).not.toThrow();
  });
  it('rejects number', () => {
    expect(() => assertOptionalString(42, 'field')).toThrow('INVALID_INPUT');
  });
  it('rejects null', () => {
    expect(() => assertOptionalString(null, 'field')).toThrow('INVALID_INPUT');
  });
});

describe('assertOptionalNumber', () => {
  it('accepts finite numbers', () => {
    expect(() => assertOptionalNumber(42, 'field')).not.toThrow();
    expect(() => assertOptionalNumber(0, 'field')).not.toThrow();
    expect(() => assertOptionalNumber(-1.5, 'field')).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalNumber(undefined, 'field')).not.toThrow();
  });
  it('rejects NaN', () => {
    expect(() => assertOptionalNumber(NaN, 'field')).toThrow('INVALID_INPUT');
  });
  it('rejects Infinity', () => {
    expect(() => assertOptionalNumber(Infinity, 'field')).toThrow('INVALID_INPUT');
  });
  it('rejects strings', () => {
    expect(() => assertOptionalNumber('42', 'field')).toThrow('INVALID_INPUT');
  });
});

describe('assertOptionalBoolean', () => {
  it('accepts true/false', () => {
    expect(() => assertOptionalBoolean(true, 'field')).not.toThrow();
    expect(() => assertOptionalBoolean(false, 'field')).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalBoolean(undefined, 'field')).not.toThrow();
  });
  it('rejects string', () => {
    expect(() => assertOptionalBoolean('true', 'field')).toThrow('INVALID_INPUT');
  });
});

describe('assertOptionalStringArray', () => {
  it('accepts string array', () => {
    expect(() => assertOptionalStringArray(['a', 'b'], 'field')).not.toThrow();
  });
  it('accepts empty array', () => {
    expect(() => assertOptionalStringArray([], 'field')).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalStringArray(undefined, 'field')).not.toThrow();
  });
  it('rejects array with non-string elements', () => {
    expect(() => assertOptionalStringArray([1, 2], 'field')).toThrow('INVALID_INPUT');
  });
  it('rejects non-array', () => {
    expect(() => assertOptionalStringArray('not-array', 'field')).toThrow('INVALID_INPUT');
  });
});

describe('assertOptionalStringEnum', () => {
  const allowed = ['a', 'b', 'c'] as const;
  it('accepts valid enum value', () => {
    expect(() => assertOptionalStringEnum('a', 'field', allowed)).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalStringEnum(undefined, 'field', allowed)).not.toThrow();
  });
  it('rejects value not in enum', () => {
    expect(() => assertOptionalStringEnum('d', 'field', allowed)).toThrow('INVALID_INPUT');
  });
});

describe('assertOptionalArray', () => {
  it('accepts any array', () => {
    expect(() => assertOptionalArray([1, 'two', true], 'field')).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalArray(undefined, 'field')).not.toThrow();
  });
  it('rejects non-array', () => {
    expect(() => assertOptionalArray({}, 'field')).toThrow('INVALID_INPUT');
  });
});

describe('assertOptionalObject', () => {
  it('accepts plain objects', () => {
    expect(() => assertOptionalObject({ key: 'val' }, 'field')).not.toThrow();
  });
  it('accepts undefined', () => {
    expect(() => assertOptionalObject(undefined, 'field')).not.toThrow();
  });
  it('rejects arrays', () => {
    expect(() => assertOptionalObject([], 'field')).toThrow('INVALID_INPUT');
  });
  it('rejects null', () => {
    expect(() => assertOptionalObject(null, 'field')).toThrow('INVALID_INPUT');
  });
  it('rejects string', () => {
    expect(() => assertOptionalObject('hello', 'field')).toThrow('INVALID_INPUT');
  });
});
