import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

interface PatternRecord {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  updated?: string;
}

const PATTERN_DIRECTORY = path.join(process.cwd(), 'docs', 'patterns');
const README_PATH = path.join(PATTERN_DIRECTORY, 'README.md');
const START_MARKER = '<!-- patterns-index:start -->';
const END_MARKER = '<!-- patterns-index:end -->';
const CATEGORY_ORDER = ['resilience', 'messaging', 'data', 'integration', 'ui', 'security', 'ops'];

async function main(): Promise<void> {
  const patterns = await loadPatterns();
  await updateReadme(patterns);
  process.stdout.write(`Updated pattern index with ${patterns.length} card(s).\n`);
}

async function loadPatterns(): Promise<PatternRecord[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(PATTERN_DIRECTORY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const records: PatternRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry.startsWith('_') || entry === 'README.md') {
      continue;
    }

    const match = entry.match(/^P-(\d{4})-([a-z0-9-]+)\.md$/i);
    if (!match) {
      continue;
    }

    const absolute = path.join(PATTERN_DIRECTORY, entry);
    const content = await fs.readFile(absolute, 'utf8');
    const frontMatter = extractFrontMatter(content);
    if (!frontMatter) {
      continue;
    }

    const id = typeof frontMatter.id === 'string' ? frontMatter.id : undefined;
    const slug = typeof frontMatter.slug === 'string' ? frontMatter.slug : undefined;
    const title = typeof frontMatter.title === 'string' ? frontMatter.title : undefined;
    const category = typeof frontMatter.category === 'string' ? frontMatter.category : undefined;
    const status = typeof frontMatter.status === 'string' ? frontMatter.status : undefined;
    const updated = typeof frontMatter.updated === 'string' ? frontMatter.updated : undefined;

    if (!id || !slug || !title || !category || !status) {
      continue;
    }

    records.push({
      id,
      slug,
      title,
      category,
      status,
      updated,
    });
  }

  return records.sort((a, b) => a.id.localeCompare(b.id));
}

async function updateReadme(records: PatternRecord[]): Promise<void> {
  let readme: string;
  try {
    readme = await fs.readFile(README_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const startIndex = readme.indexOf(START_MARKER);
  const endIndex = readme.indexOf(END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('patterns/README.md is missing index markers.');
  }

  const before = readme.slice(0, startIndex + START_MARKER.length);
  const after = readme.slice(endIndex);

  const grouped = groupByCategory(records);
  const sections: string[] = [];

  for (const category of CATEGORY_ORDER) {
    const items = grouped.get(category);
    if (!items || items.length === 0) {
      continue;
    }
    const header = `### ${capitalize(category)}`;
    const table = buildTable(items);
    sections.push(`${header}\n\n${table}`);
  }

  if (sections.length === 0) {
    sections.push('_No patterns yet._');
  }

  const content = `${before}\n\n${sections.join('\n\n')}\n\n${after}`;
  await fs.writeFile(README_PATH, content.trimEnd() + '\n');
}

function buildTable(records: PatternRecord[]): string {
  const header = '| ID | Title | Status | Updated |\n| --- | --- | --- | --- |';
  const rows = records.map((record) => {
    const link = `[${record.id}](./${record.id}-${record.slug}.md)`;
    const updated = record.updated ?? 'N/A';
    return `| ${link} | ${record.title} | ${record.status} | ${updated} |`;
  });
  return [header, ...rows].join('\n');
}

function groupByCategory(records: PatternRecord[]): Map<string, PatternRecord[]> {
  const map = new Map<string, PatternRecord[]>();
  for (const record of records) {
    const bucket = map.get(record.category) ?? [];
    bucket.push(record);
    map.set(record.category, bucket);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
  }
  return map;
}

function extractFrontMatter(content: string): Record<string, unknown> | undefined {
  const normalized = content.replace(/\r\n/g, '\n').trimStart();
  if (!normalized.startsWith('---\n')) {
    return undefined;
  }

  const closingIndex = normalized.indexOf('\n---', 4);
  if (closingIndex === -1) {
    return undefined;
  }

  const frontMatter = normalized.slice(4, closingIndex);
  try {
    const parsed = parseYaml(frontMatter);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

main().catch((error) => {
  process.stderr.write(`patterns:index failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
