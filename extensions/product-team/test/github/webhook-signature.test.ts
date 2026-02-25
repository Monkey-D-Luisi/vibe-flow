import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertValidGithubWebhookSignature,
  InvalidGithubSignatureError,
  MissingGithubSignatureError,
} from '../../src/github/webhook-signature.js';

describe('webhook signature verification', () => {
  it('accepts a valid GitHub sha256 signature', () => {
    const secret = 'test-secret';
    const payload = Buffer.from('{"ok":true}', 'utf8');
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

    expect(() => {
      assertValidGithubWebhookSignature(secret, payload, signature);
    }).not.toThrow();
  });

  it('rejects missing signature headers', () => {
    expect(() => {
      assertValidGithubWebhookSignature('test-secret', Buffer.from('{}', 'utf8'), null);
    }).toThrow(MissingGithubSignatureError);
  });

  it('rejects invalid signatures', () => {
    expect(() => {
      assertValidGithubWebhookSignature(
        'test-secret',
        Buffer.from('{"ok":true}', 'utf8'),
        'sha256=deadbeef',
      );
    }).toThrow(InvalidGithubSignatureError);
  });
});
