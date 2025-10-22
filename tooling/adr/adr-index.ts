import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

interface AdrRecord {
  id: string;
  title: string;
  status: string;
  date?: string;
  fileName: string;
  href: string;
}

const ADR_DIRECTORY = path.join(process.cwd(), 'docs', 'adr');
const README_PATH = path.join(ADR_DIRECTORY, 'README.md');
const START_MARKER = '<!-- adr-index:start -->';
const END_MARKER = '<!-- adr-index:end -->';
const ADR_FILE_PATTERN = /^ADR-(\d{4})-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.md$/i;

async function main(): Promise<void> {
  const records = await loadAdrRecords();
  await updateReadme(records);
  process.stdout.write(`Updated ADR index with ${records.length} record(s).\n`);
}

async function loadAdrRecords(): Promise<AdrRecord[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(ADR_DIRECTORY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const records: AdrRecord[] = [];

  for (const entry of entries) {
    if (!ADR_FILE_PATTERN.test(entry)) {
      continue;
    }

    const absolute = path.join(ADR_DIRECTORY, entry);
    const content = await fs.readFile(absolute, 'utf8');

    const metadata = extractFrontMatter(content);
    if (!metadata) {
      continue;
    }

    const id = typeof metadata.id === 'string' ? metadata.id : undefined;
    const title = typeof metadata.title === 'string' ? metadata.title : undefined;
    const status = typeof metadata.status === 'string' ? metadata.status : undefined;
    const date = typeof metadata.date === 'string' ? metadata.date : undefined;

    if (!id || !title || !status) {
      continue;
    }

    records.push({
      id,
      title,
      status,
      date,
      fileName: entry,
      href: entry,
    });
  }

  return records.sort((a, b) => a.id.localeCompare(b.id));
}

async function updateReadme(records: AdrRecord[]): Promise<void> {
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
    throw new Error('ADR README is missing index markers.');
  }

  const before = readme.slice(0, startIndex + START_MARKER.length);
  const after = readme.slice(endIndex);

  const table = buildIndexTable(records);
  const nextContent = `${before}\n\n${table}\n\n${after}`;

  await fs.writeFile(README_PATH, nextContent.trimEnd() + '\n');
}

function buildIndexTable(records: AdrRecord[]): string {
  if (records.length === 0) {
    return '_No ADRs yet._';
  }

  const header = '| ID | Title | Status | Date |\n| --- | --- | --- | --- |';
  const rows = records.map((record) => {
    const link = `[${record.id}](${record.href})`;
    const safeDate = record.date ?? 'N/A';
    return `| ${link} | ${record.title} | ${record.status} | ${safeDate} |`;
  });

  return [header, ...rows].join('\n');
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

main().catch((error) => {
  process.stderr.write(`adr:index failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
