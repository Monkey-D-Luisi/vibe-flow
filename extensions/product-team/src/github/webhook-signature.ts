import { createHmac, timingSafeEqual } from 'node:crypto';

const GITHUB_HMAC_PREFIX = 'sha256=';

export class MissingGithubSignatureError extends Error {
  constructor() {
    super('Missing x-hub-signature-256 header');
    this.name = 'MissingGithubSignatureError';
  }
}

export class InvalidGithubSignatureError extends Error {
  constructor() {
    super('Invalid GitHub webhook signature');
    this.name = 'InvalidGithubSignatureError';
  }
}

function decodeSignature(signatureHeader: string): Buffer | null {
  const trimmed = signatureHeader.trim();
  if (!trimmed.startsWith(GITHUB_HMAC_PREFIX)) {
    return null;
  }

  const hexDigest = trimmed.slice(GITHUB_HMAC_PREFIX.length).trim();
  if (hexDigest.length !== 64 || !/^[a-f0-9]+$/i.test(hexDigest)) {
    return null;
  }

  try {
    return Buffer.from(hexDigest, 'hex');
  } catch {
    return null;
  }
}

function computeDigest(secret: string, payload: Buffer): Buffer {
  return Buffer.from(createHmac('sha256', secret).update(payload).digest('hex'), 'hex');
}

export function assertValidGithubWebhookSignature(
  secret: string,
  payload: Buffer,
  signatureHeader: string | null,
): void {
  if (!signatureHeader) {
    throw new MissingGithubSignatureError();
  }

  const receivedDigest = decodeSignature(signatureHeader);
  const expectedDigest = computeDigest(secret, payload);
  if (!receivedDigest || receivedDigest.length !== expectedDigest.length) {
    throw new InvalidGithubSignatureError();
  }

  if (!timingSafeEqual(receivedDigest, expectedDigest)) {
    throw new InvalidGithubSignatureError();
  }
}
