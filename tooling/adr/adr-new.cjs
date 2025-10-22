#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout, exit, cwd } = require('node:process');

const TEMPLATE_PATH = path.join(cwd(), 'docs', 'adr', '_TEMPLATE.md');
const ADR_DIRECTORY = path.join(cwd(), 'docs', 'adr');

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

    const targetFile = path.join(ADR_DIRECTORY, `${nextId}-${slug}.md`);
    await ensureFileDoesNotExist(targetFile);

    const template = await fs.readFile(TEMPLATE_PATH, 'utf8');
    const today = new Date().toISOString().slice(0, 10);

    const content = template
      .replace(/ADR-XXXX/g, nextId)
      .replace('<Short imperative title>', title)
      .replace(/{{title}}/g, title)
      .replace('YYYY-MM-DD', today);

    await fs.writeFile(targetFile, content, { flag: 'wx' });

    stdout.write(`ADR created at ${relativePath(targetFile)}\n`);
    stdout.write('Remember to update owners, area, and the required sections.\n');
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
  await fs.mkdir(ADR_DIRECTORY, { recursive: true });
  const entries = await fs.readdir(ADR_DIRECTORY);

  let max = 0;
  for (const entry of entries) {
    const match = entry.match(/^ADR-(\d{4})-[a-z0-9-]+\.md$/i);
    if (!match) {
      continue;
    }
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric)) {
      max = Math.max(max, numeric);
    }
  }

  return `ADR-${String(max + 1).padStart(4, '0')}`;
}

async function ensureFileDoesNotExist(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  throw new Error(`An ADR already exists at ${relativePath(filePath)}. Adjust the slug or check for duplicates.`);
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

function relativePath(filePath) {
  return path.relative(cwd(), filePath).replace(/\\/g, '/');
}

main().catch((error) => {
  stdout.write(`Error creating ADR: ${error.message}\n`);
  exit(1);
});
