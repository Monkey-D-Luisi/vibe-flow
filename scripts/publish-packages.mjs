#!/usr/bin/env node
/**
 * publish-packages.mjs
 *
 * Discovers all publishable @openclaw/* workspace packages (those without "private: true")
 * and publishes them to npm using `pnpm publish` (which rewrites workspace:* dependencies
 * to resolved versions automatically). Pass --dry-run to verify packaging without
 * actually uploading to the registry.
 *
 * Usage:
 *   node scripts/publish-packages.mjs            # publish
 *   node scripts/publish-packages.mjs --dry-run  # dry-run only
 *
 * Publish order:
 *   1. packages/quality-contracts (foundational dependency)
 *   2. extensions/* (alphabetical, no cross-extension deps)
 *   3. tools/* (alphabetical)
 *
 * Rollback procedure:
 *   npm unpublish is available within 72 hours of publishing.
 *   To unpublish a specific version:
 *     npm unpublish @openclaw/<package>@<version>
 *   To deprecate (preferred over unpublish for older packages):
 *     npm deprecate @openclaw/<package>@<version> "reason"
 *   See https://docs.npmjs.com/policies/unpublish for full policy.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const dryRun = process.argv.includes('--dry-run');
const workspaceDirs = ['packages', 'extensions', 'tools'];

let published = 0;
let skipped = 0;
let errors = 0;

/**
 * Returns true if `name@version` already exists on the npm registry.
 * Throws on non-404 errors (network, auth, registry) so callers can surface them.
 * @param {string} name
 * @param {string} version
 */
function isAlreadyPublished(name, version) {
  try {
    execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: 'pipe' });
    return true;
  } catch (err) {
    const stderr = String(/** @type {any} */ (err)?.stderr ?? '');
    if (
      stderr.includes('E404') ||
      stderr.includes('404 Not Found') ||
      stderr.includes('is not in the npm registry')
    ) {
      // Package/version not found — treat as not yet published.
      return false;
    }
    // Non-404 error (network, auth, registry issue) — surface it.
    throw err;
  }
}

for (const dir of workspaceDirs) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    // Directory does not exist in this workspace; skip silently.
    continue;
  }

  for (const entry of entries) {
    const pkgPath = join(dir, entry.name, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }

    if (manifest.private || !manifest.name || !manifest.version) {
      continue;
    }

    // Only publish packages in the @openclaw/ scope (or the create-vibe-flow CLI).
    if (!manifest.name.startsWith('@openclaw/') && manifest.name !== 'create-vibe-flow') {
      continue;
    }

    const { name, version } = manifest;
    const pkgDir = join(dir, entry.name);

    if (!dryRun && isAlreadyPublished(name, version)) {
      console.log(`  skip  ${name}@${version} — already on registry`);
      skipped++;
      continue;
    }

    // Use pnpm publish so workspace:* dependency specifiers are rewritten to resolved
    // versions before the tarball is created. --no-git-checks bypasses the clean
    // working-tree and committed-files checks that pnpm enforces by default in CI.
    const publishArgs = dryRun
      ? ['--no-git-checks', '--dry-run', '--access', 'public']
      : ['--no-git-checks', '--provenance', '--access', 'public'];

    console.log(`  ${dryRun ? 'dry-run' : 'publish'} ${name}@${version}`);
    try {
      execFileSync('pnpm', ['publish', ...publishArgs], { cwd: pkgDir, stdio: 'inherit' });
      published++;
    } catch (err) {
      console.error(`  ERROR publishing ${name}@${version}: ${/** @type {any} */ (err).message}`);
      errors++;
    }
  }
}

console.log('');
console.log(
  `Done: ${published} ${dryRun ? 'dry-run succeeded' : 'published'}, ${skipped} skipped, ${errors} errors.`,
);

if (errors > 0) {
  process.exit(1);
}
