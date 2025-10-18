#!/usr/bin/env node

/**
 * Skip test execution when SKIP_TESTS=1 is present.
 * Exits with 0 to indicate tests should be bypassed, otherwise 1 so callers can chain `|| pnpm test`.
 */
const shouldSkip = process.env.SKIP_TESTS === '1';

if (shouldSkip) {
  console.log('[hooks] SKIP_TESTS=1 detected, skipping test execution.');
  process.exit(0);
}

process.exit(1);
