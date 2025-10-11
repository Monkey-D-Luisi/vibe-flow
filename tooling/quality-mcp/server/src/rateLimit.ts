import { config } from './config.js';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number
  ) {}

  consume(key: string, cost = 1, now = Date.now()): boolean {
    if (this.ratePerSecond <= 0) {
      return true;
    }
    const bucket = this.getBucket(key, now);
    this.refill(bucket, now);
    if (bucket.tokens < cost) {
      return false;
    }
    bucket.tokens -= cost;
    return true;
  }

  private getBucket(key: string, now: number): Bucket {
    const existing = this.buckets.get(key);
    if (existing) {
      return existing;
    }
    const bucket = { tokens: this.burst, lastRefill: now };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private refill(bucket: Bucket, now: number): void {
    const delta = now - bucket.lastRefill;
    if (delta <= 0) {
      return;
    }
    const tokensToAdd = (delta / 1000) * this.ratePerSecond;
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.burst, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }
}

export const rateLimiter = new TokenBucketLimiter(config.rateLimitRps, config.rateLimitBurst);
