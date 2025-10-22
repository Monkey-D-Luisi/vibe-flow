#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout, exit, cwd } = require('node:process');

const TEMPLATE_PATH = path.join(cwd(), 'docs', 'patterns', '_TEMPLATE.md');
const PATTERN_DIRECTORY = path.join(cwd(), 'docs', 'patterns');
const CATEGORY_OPTIONS = ['resilience', 'messaging', 'data', 'integration', 'ui', 'security', 'ops'];

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    await ensureTemplateExists();
    const nextId = await computeNextId();

    const title = await promptNonEmpty(rl, 'Title (required): ');
    const defaultSlug = slugify(title);
    const slugInput = (await rl.question(`Slug [${defaultSlug}]: `)).trim();
    const slug = slugInput ? slugify(slugInput) : defaultSlug;

    if (!slug) {
      throw new Error('Could not generate a valid slug. Use alphanumeric characters.');
    }

    const category = await promptCategory(rl);
    const ownerInput = (await rl.question('Owner [architecture]: ')).trim();
    const owner = ownerInput || 'architecture';

    const targetFile = path.join(PATTERN_DIRECTORY, `${nextId}-${slug}.md`);
    await ensureFileDoesNotExist(targetFile);

    const template = await fs.readFile(TEMPLATE_PATH, 'utf8');
    const today = new Date().toISOString().slice(0, 10);

    let content = template;
    const replacements = {
      'P-XXXX': nextId,
      '<kebab-slug>': slug,
      '<Pattern title>': title,
      '<Pattern name>': title,
      '<pattern name>': title,
      '<resilience|messaging|data|integration|ui|security|ops>': category,
      'YYYY-MM-DD': today,
      '<YYYY-MM-DD>': today,
    };

    for (const [token, value] of Object.entries(replacements)) {
      content = content.split(token).join(value);
    }

    // Replace owner placeholder specifically
    content = content.replace('owner: architecture', `owner: ${owner}`);

    await fs.writeFile(targetFile, content, { flag: 'wx' });

    stdout.write(`Pattern created at ${relativePath(targetFile)}\n`);
    stdout.write('Remember to enrich trade-offs, references, and cross-links.\n');
  } finally {
    rl.close();
  }
}

async function ensureTemplateExists() {
  try {
    await fs.access(TEMPLATE_PATH);
  } catch {
    throw new Error(`Template not found at ${relativePath(TEMPLATE_PATH)}.`);
  }
}

async function computeNextId() {
  await fs.mkdir(PATTERN_DIRECTORY, { recursive: true });
  const entries = await fs.readdir(PATTERN_DIRECTORY);

  let max = 0;
  for (const entry of entries) {
    const match = entry.match(/^P-(\d{4})-[a-z0-9-]+\.md$/i);
    if (!match) {
      continue;
    }
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric)) {
      max = Math.max(max, numeric);
    }
  }

  return `P-${String(max + 1).padStart(4, '0')}`;
}

async function ensureFileDoesNotExist(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  throw new Error(`A pattern already exists at ${relativePath(filePath)}. Adjust the slug or verify duplicates.`);
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function promptNonEmpty(rl, message) {
  let answer = '';
  while (!answer.trim()) {
    answer = await rl.question(message);
    if (!answer.trim()) {
      stdout.write('Value cannot be empty.\n');
    }
  }
  return answer.trim();
}

async function promptCategory(rl) {
  const choices = CATEGORY_OPTIONS.join(', ');
  while (true) {
    const categoryInput = (await rl.question(`Category [${choices}] (default resilience): `)).trim();
    if (!categoryInput) {
      return 'resilience';
    }
    if (CATEGORY_OPTIONS.includes(categoryInput)) {
      return categoryInput;
    }
    stdout.write(`Invalid category. Choose one of: ${choices}.\n`);
  }
}

function relativePath(filePath) {
  return path.relative(cwd(), filePath).replace(/\\/g, '/');
}

main().catch((error) => {
  stdout.write(`Error creating pattern: ${error.message}\n`);
  exit(1);
});
