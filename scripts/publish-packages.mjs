#!/usr/bin/env node
/**
 * publish-packages.mjs
 *
 * Discovers all publishable workspace packages (those without "private: true")
 * and publishes them to npm. Pass --dry-run to verify packaging without
 * actually uploading to the registry.
 *
 * Usage:
 *   node scripts/publish-packages.mjs            # publish
 *   node scripts/publish-packages.mjs --dry-run  # dry-run only
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const dryRun = process.argv.includes('--dry-run');
const workspaceDirs = ['packages', 'extensions', 'tools'];

let published = 0;
let skipped = 0;
let errors = 0;

/**
 * Returns true if `name@version` already exists on the npm registry.
 * @param {string} name
 * @param {string} version
 */
function isAlreadyPublished(name, version) {
  try {
    execSync(`npm view ${name}@${version} version`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
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

    const { name, version } = manifest;
    const pkgDir = join(dir, entry.name);

    if (!dryRun && isAlreadyPublished(name, version)) {
      console.log(`  skip  ${name}@${version} — already on registry`);
      skipped++;
      continue;
    }

    const publishArgs = dryRun
      ? '--dry-run --access public'
      : '--provenance --access public';

    console.log(`  ${dryRun ? 'dry-run' : 'publish'} ${name}@${version}`);
    try {
      execSync(`npm publish ${publishArgs}`, { cwd: pkgDir, stdio: 'inherit' });
      published++;
    } catch (err) {
      console.error(`  ERROR publishing ${name}@${version}: ${err.message}`);
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
