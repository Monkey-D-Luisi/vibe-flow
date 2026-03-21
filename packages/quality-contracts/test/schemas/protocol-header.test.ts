import { describe, it, expect } from 'vitest';
import {
  CURRENT_PROTOCOL_VERSION,
  parseVersion,
  checkVersionCompatibility,
} from '../../src/schemas/protocol-header.js';

describe('CURRENT_PROTOCOL_VERSION', () => {
  it('is a valid semver string', () => {
    expect(CURRENT_PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is 1.0.0 for the initial release', () => {
    expect(CURRENT_PROTOCOL_VERSION).toBe('1.0.0');
  });
});

describe('parseVersion', () => {
  it('parses valid version strings', () => {
    expect(parseVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(parseVersion('2.3.4')).toEqual({ major: 2, minor: 3, patch: 4 });
    expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('returns undefined for invalid versions', () => {
    expect(parseVersion('')).toBeUndefined();
    expect(parseVersion('1.0')).toBeUndefined();
    expect(parseVersion('v1.0.0')).toBeUndefined();
    expect(parseVersion('abc')).toBeUndefined();
    expect(parseVersion('1.0.0-beta')).toBeUndefined();
  });
});

describe('checkVersionCompatibility', () => {
  it('returns exact_match for identical versions', () => {
    const result = checkVersionCompatibility('1.0.0', '1.0.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('exact_match');
  });

  it('returns minor_forward_compat for same major, different minor', () => {
    const result = checkVersionCompatibility('1.0.0', '1.1.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('minor_forward_compat');
  });

  it('returns minor_forward_compat for same major, different patch', () => {
    const result = checkVersionCompatibility('1.0.0', '1.0.1');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBe('minor_forward_compat');
  });

  it('returns major_mismatch for different major versions', () => {
    const result = checkVersionCompatibility('1.0.0', '2.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('major_mismatch');
  });

  it('is symmetric for same major', () => {
    const fwd = checkVersionCompatibility('1.1.0', '1.0.0');
    const rev = checkVersionCompatibility('1.0.0', '1.1.0');
    expect(fwd.compatible).toBe(true);
    expect(rev.compatible).toBe(true);
  });

  it('returns major_mismatch for unparseable sender version', () => {
    const result = checkVersionCompatibility('invalid', '1.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('major_mismatch');
  });

  it('returns major_mismatch for unparseable receiver version', () => {
    const result = checkVersionCompatibility('1.0.0', '');
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe('major_mismatch');
  });
});
