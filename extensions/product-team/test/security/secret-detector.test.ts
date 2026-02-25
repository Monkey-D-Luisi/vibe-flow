import { describe, it, expect } from 'vitest';
import {
  containsSecret,
  REDACTED_VALUE,
  scrubSecrets,
  validateMetadataNoSecrets,
} from '../../src/security/secret-detector.js';

describe('secret-detector', () => {
  it('detects known secret formats', () => {
    expect(containsSecret('ghp_123456789012345678901234567890123456')).toBe(true);
    expect(containsSecret('sk-abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
    expect(containsSecret('plain text')).toBe(false);
  });

  it('returns metadata paths with secret-like values', () => {
    const paths = validateMetadataNoSecrets({
      nested: {
        token: 'not-empty-token',
      },
      auth: {
        value: 'ghp_123456789012345678901234567890123456',
      },
      items: ['safe', 'sk-abcdefghijklmnopqrstuvwxyz123456'],
    });

    expect(paths).toContain('metadata.nested.token');
    expect(paths).toContain('metadata.auth.value');
    expect(paths).toContain('metadata.items[1]');
  });

  it('scrubs secret-like values recursively', () => {
    const scrubbed = scrubSecrets({
      token: 'hidden-value',
      nested: {
        apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      },
      arr: ['safe', 'ghp_123456789012345678901234567890123456'],
    }) as {
      token: string;
      nested: { apiKey: string };
      arr: string[];
    };

    expect(scrubbed.token).toBe(REDACTED_VALUE);
    expect(scrubbed.nested.apiKey).toBe(REDACTED_VALUE);
    expect(scrubbed.arr[1]).toBe(REDACTED_VALUE);
    expect(scrubbed.arr[0]).toBe('safe');
  });
});
