import { promises as fs, Dirent } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';

type AdrStatus = 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';

type Severity = 'error' | 'warning';

interface LintIssue {
  file: string;
  message: string;
  hint?: string;
  related?: string;
  severity: Severity;
}

interface LintSummary {
  issues: LintIssue[];
  checked: number;
  skipped: number;
  targetFiles: string[];
}

interface AdrMetadata {
  id: string;
  title: string;
  status: AdrStatus;
  date?: string;
  owners: string[];
  area?: string;
  links: {
    issues: string[];
    pr: string[];
    docs: string[];
    [key: string]: unknown;
  };
  supersedes: string[];
  superseded_by: string | null;
  [key: string]: unknown;
}

interface AdrDocument {
  path: string;
  fileName: string;
  idFromPath: string;
  slug: string;
  body: string;
  frontMatter: string;
  rawMetadata: unknown;
  metadata?: AdrMetadata;
}

const ADR_FILE_PATTERN = /^ADR-(\d{4})-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.md$/i;
const ID_PATTERN = /^ADR-\d{4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_STATUSES: readonly AdrStatus[] = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'];
const REQUIRED_HEADINGS = [
  { canonical: 'Context', regex: /^##\s+Context\s*$/im },
  { canonical: 'Decision', regex: /^##\s+Decision\s*$/im },
  { canonical: 'Considered Alternatives', regex: /^##\s+Considered\s+Alternatives\s*$/im },
  { canonical: 'Consequences', regex: /^##\s+Consequences\s*$/im },
];

const CLI_DESCRIPTION = `ADR Linter

Usage:
  pnpm adr:lint [options] [paths...]

Options:
  --changed        Lint only the ADR files changed with respect to the working tree.
  --json           Output the report as JSON.
  --help           Print this message.
`;

export async function lintRepository(targetFiles?: Set<string>): Promise<LintSummary> {
  const { documents, issues: loadIssues } = await loadAdrDocuments();

  const normalizedTargets = targetFiles ?? new Set(documents.map((doc) => doc.path));

  const issues: LintIssue[] = [...loadIssues];
  const adrIndex = new Map<string, AdrDocument>();

  for (const doc of documents) {
    const metaResult = parseMetadata(doc);
    doc.metadata = metaResult.metadata;
    issues.push(...metaResult.issues);

    if (doc.metadata) {
      const existing = adrIndex.get(doc.metadata.id);
      if (existing) {
        issues.push(
          createIssue(doc.path, `Duplicate ID ${doc.metadata.id}.`, `First seen in ${relativePath(existing.path)}.`),
        );
      } else {
        adrIndex.set(doc.metadata.id, doc);
      }
    }
  }

  for (const doc of documents) {
    if (!normalizedTargets.has(doc.path)) {
      continue;
    }
    issues.push(...validateDocument(doc, adrIndex));
  }

  const checked = documents.filter((doc) => normalizedTargets.has(doc.path)).length;
  const skipped = documents.length - checked;

  return {
    issues: sortIssues(issues),
    checked,
    skipped,
    targetFiles: Array.from(normalizedTargets).map(relativePath).sort(),
  };
}

function sortIssues(issues: LintIssue[]): LintIssue[] {
  return [...issues].sort((a, b) => {
    if (a.file === b.file) {
      if (a.severity === b.severity) {
        return a.message.localeCompare(b.message);
      }
      return a.severity === 'error' ? -1 : 1;
    }
    return a.file.localeCompare(b.file);
  });
}

async function loadAdrDocuments(): Promise<{ documents: AdrDocument[]; issues: LintIssue[] }> {
  const adrDirectory = path.join(process.cwd(), 'docs', 'adr');
  let entries: Dirent[];
  try {
    entries = await fs.readdir(adrDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`ADR directory not found: ${relativePath(adrDirectory)}.`);
    }
    throw error;
  }

  const docs: AdrDocument[] = [];
  const issues: LintIssue[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === '_TEMPLATE.md' || entry.name === 'README.md') {
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.md')) {
      continue;
    }

    const absolutePath = path.join(adrDirectory, entry.name);
    const fileContent = await fs.readFile(absolutePath, 'utf8');

    let parsed: { frontMatter: string; metadata: unknown; body: string };
    try {
      parsed = extractFrontMatter(fileContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error procesando front matter.';
      issues.push(createIssue(absolutePath, message));
      continue;
    }

    docs.push({
      path: absolutePath,
      fileName: entry.name,
      idFromPath: '',
      slug: '',
      body: parsed.body,
      frontMatter: parsed.frontMatter,
      rawMetadata: parsed.metadata,
    });
  }

  return {
    documents: docs.sort((a, b) => a.fileName.localeCompare(b.fileName)),
    issues,
  };
}

function extractFrontMatter(content: string): {
  frontMatter: string;
  metadata: unknown;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, '\n').trimStart();
  if (!normalized.startsWith('---\n')) {
    throw new Error('File must begin with YAML front matter.');
  }

  const closingIndex = normalized.indexOf('\n---', 4);
  if (closingIndex === -1) {
    throw new Error('Front matter is missing the closing delimiter.');
  }

  const frontMatter = normalized.slice(4, closingIndex);
  const remainderStart = closingIndex + 4;

  let body = normalized.slice(remainderStart);
  if (body.startsWith('\n')) {
    body = body.slice(1);
  }

  let metadata: unknown;
  try {
    metadata = parseYaml(frontMatter);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error while parsing YAML.';
    throw new Error(`Invalid front matter: ${message}`);
  }

  return { frontMatter, metadata, body };
}

function parseMetadata(doc: AdrDocument): { metadata?: AdrMetadata; issues: LintIssue[] } {
  const issues: LintIssue[] = [];
  const metadata = doc.rawMetadata;

  if (!isPlainObject(metadata)) {
    issues.push(createIssue(doc.path, 'Front matter must be a YAML object.'));
    return { issues };
  }

  // File pattern validation relies on metadata id.
  const { fileId, slug } = inferPathParts(doc.fileName);
  doc.idFromPath = fileId;
  doc.slug = slug;

  const id = metadata.id;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    issues.push(createIssue(doc.path, 'Field `id` must match the ADR-0000 pattern.'));
  }

  const title = metadata.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    issues.push(createIssue(doc.path, 'Field `title` is required.'));
  }

  const status = metadata.status;
  if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status as AdrStatus)) {
    issues.push(
      createIssue(
        doc.path,
        `Status "${String(status)}" is invalid.`,
        `Use one of: ${ALLOWED_STATUSES.join(', ')}.`,
      ),
    );
  }

  const date = metadata.date;
  if (date !== undefined && (typeof date !== 'string' || !DATE_PATTERN.test(date))) {
    issues.push(createIssue(doc.path, 'Field `date` must follow the YYYY-MM-DD format.'));
  }

  const owners = normalizeStringArray(metadata.owners);
  if (!owners) {
    issues.push(createIssue(doc.path, 'Field `owners` must be a list of strings.'));
  } else if (owners.length === 0) {
    issues.push(createIssue(doc.path, 'At least one `owner` must be provided.'));
  }

  let area: string | undefined;
  if (metadata.area !== undefined) {
    if (typeof metadata.area !== 'string' || metadata.area.trim().length === 0) {
      issues.push(createIssue(doc.path, 'Field `area` must be a non-empty string when provided.'));
    } else {
      area = metadata.area;
    }
  }

  const links = metadata.links;
  if (!isPlainObject(links)) {
    issues.push(createIssue(doc.path, 'Field `links` must be an object containing arrays.'));
  }

  const issuesLinks = normalizeStringArray(links?.issues);
  const prLinks = normalizeStringArray(links?.pr);
  const docsLinks = normalizeStringArray(links?.docs);

  if (!issuesLinks || !prLinks || !docsLinks) {
    issues.push(createIssue(doc.path, 'Fields `links.issues`, `links.pr`, and `links.docs` must be string arrays.'));
  }

  const supersedes = normalizeStringArray(metadata.supersedes);
  if (!supersedes) {
    issues.push(createIssue(doc.path, 'Field `supersedes` must be an array (use an empty array when not applicable).'));
  } else {
    for (const ref of supersedes) {
      if (!ID_PATTERN.test(ref)) {
        issues.push(createIssue(doc.path, `Invalid entry in supersedes: ${ref}.`));
      }
    }
  }

  let supersededBy: string | null = null;
  if (metadata.superseded_by !== undefined && metadata.superseded_by !== null) {
    if (typeof metadata.superseded_by !== 'string' || !ID_PATTERN.test(metadata.superseded_by)) {
      issues.push(createIssue(doc.path, 'Field `superseded_by` must be null or a valid ADR ID.'));
    } else {
      supersededBy = metadata.superseded_by;
    }
  } else if (metadata.superseded_by === null) {
    supersededBy = null;
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    metadata: {
      id: id as string,
      title: title as string,
      status: status as AdrStatus,
      date: date as string | undefined,
      owners: owners!,
      area,
      links: {
        issues: issuesLinks ?? [],
        pr: prLinks ?? [],
        docs: docsLinks ?? [],
      },
      supersedes: supersedes ?? [],
      superseded_by: supersededBy ?? null,
    },
    issues,
  };
}

function validateDocument(doc: AdrDocument, index: Map<string, AdrDocument>): LintIssue[] {
  const issues: LintIssue[] = [];
  const metadata = doc.metadata;

  if (!metadata) {
    // Metadata errors were already reported during parsing.
    return issues;
  }

  if (!ADR_FILE_PATTERN.test(doc.fileName)) {
    issues.push(
      createIssue(
        doc.path,
        `Invalid file name: ${doc.fileName}.`,
        'Use ADR-0000-slug.md with a kebab-case slug.',
      ),
    );
  } else if (metadata.id !== doc.idFromPath) {
    issues.push(
      createIssue(
        doc.path,
        `Front matter ID (${metadata.id}) does not match the file name (${doc.idFromPath}).`,
      ),
    );
  }

  if (metadata.status === 'accepted') {
    if (!metadata.date) {
      issues.push(createIssue(doc.path, '`accepted` ADRs must define `date`.'));
    }
    if (!metadata.owners || metadata.owners.length === 0) {
      issues.push(createIssue(doc.path, '`accepted` ADRs require at least one owner.'));
    }
  }

  if (metadata.status === 'superseded' && !metadata.superseded_by) {
    issues.push(createIssue(doc.path, '`superseded` ADRs must define `superseded_by`.'));
  }

  issues.push(...validateHeadings(doc));
  issues.push(...validateCrossReferences(doc, index));

  return issues;
}

function validateHeadings(doc: AdrDocument): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const heading of REQUIRED_HEADINGS) {
    if (!heading.regex.test(doc.body)) {
      issues.push(
        createIssue(
          doc.path,
          `Missing required heading "${heading.canonical}".`,
        ),
      );
    }
  }
  return issues;
}

function validateCrossReferences(doc: AdrDocument, index: Map<string, AdrDocument>): LintIssue[] {
  const issues: LintIssue[] = [];
  const metadata = doc.metadata!;

  for (const ref of metadata.supersedes) {
    const target = index.get(ref);
    if (!target) {
      issues.push(createIssue(doc.path, `supersedes points to a non-existent ADR: ${ref}.`));
      continue;
    }

    if (!target.metadata) {
      continue;
    }

    if (target.metadata.superseded_by !== metadata.id) {
      issues.push(
        createIssue(
          doc.path,
          `supersedes ${ref} missing reverse link.`,
          `Update ${relativePath(target.path)} to include superseded_by: ${metadata.id}.`,
        ),
      );
    }
  }

  if (metadata.superseded_by) {
    const target = index.get(metadata.superseded_by);
    if (!target) {
      issues.push(createIssue(doc.path, `superseded_by points to a non-existent ADR: ${metadata.superseded_by}.`));
    } else if (target.metadata && !target.metadata.supersedes.includes(metadata.id)) {
      issues.push(
        createIssue(
          doc.path,
          `superseded_by ${metadata.superseded_by} missing reverse link.`,
          `Add ${metadata.id} to supersedes in ${relativePath(target.path)}.`,
        ),
      );
    }
  }

  return issues;
}

function inferPathParts(fileName: string): { fileId: string; slug: string } {
  const match = fileName.match(ADR_FILE_PATTERN);
  if (!match) {
    return { fileId: '', slug: '' };
  }
  return {
    fileId: `ADR-${match[1]}`,
    slug: match[2],
  };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const trimmed = value.map((item) => (typeof item === 'string' ? item.trim() : null));
  if (trimmed.some((item) => item === null || item === '')) {
    return undefined;
  }
  return trimmed as string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createIssue(filePath: string, message: string, hint?: string, severity: Severity = 'error'): LintIssue {
  return {
    file: relativePath(filePath),
    message,
    hint,
    severity,
  };
}

function relativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function resolveTargetSet(args: {
  files: string[];
  changed: boolean;
}): Set<string> {
  const targets = new Set<string>();

  if (args.files.length > 0) {
    for (const input of args.files) {
      const resolved = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
      targets.add(resolved);
    }
    return targets;
  }

  if (args.changed) {
    for (const changedFile of getChangedAdrFiles()) {
      targets.add(path.join(process.cwd(), changedFile));
    }
    if (targets.size > 0) {
      return targets;
    }
  }

  return targets;
}

function getChangedAdrFiles(): string[] {
  try {
    const output = execFileSync('git', ['status', '--porcelain', '--', 'docs/adr'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = output.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return lines
      .map((line) => {
        const match = line.match(/^\S{2}\s+(.*)$/);
        if (!match) {
          return null;
        }
        const filePath = match[1]!.includes(' -> ')
          ? match[1]!.split(' -> ').pop()!
          : match[1]!;
        return filePath.trim();
      })
      .filter((file): file is string => Boolean(file))
      .filter((file) => ADR_FILE_PATTERN.test(path.basename(file)))
      .map((file) => file.replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

async function runCli(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      changed: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
    tokens: false,
  });

  if (values.help) {
    process.stdout.write(CLI_DESCRIPTION);
    return;
  }

  const requestedTargets = resolveTargetSet({
    files: positionals,
    changed: Boolean(values.changed),
  });

  const summary = await lintRepository(requestedTargets.size ? requestedTargets : undefined);

  if (values.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ...summary,
          issues: summary.issues.map((issue) => ({
            ...issue,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    renderSummary(summary);
  }

  process.exit(summary.issues.some((issue) => issue.severity === 'error') ? 1 : 0);
}

function renderSummary(summary: LintSummary): void {
  const { issues, checked, skipped } = summary;

  if (issues.length === 0) {
    process.stdout.write(`ADR lint passed (${checked} files checked, ${skipped} skipped).\n`);
    return;
  }

  for (const issue of issues) {
    const prefix = issue.severity === 'error' ? '[error]' : '[warn]';
    process.stdout.write(`${prefix} ${issue.file}: ${issue.message}\n`);
    if (issue.hint) {
      process.stdout.write(`        hint: ${issue.hint}\n`);
    }
  }

  process.stdout.write(`\nFound ${issues.length} issue(s) across ${checked} files (${skipped} skipped).\n`);
}

if (isCliEntrypoint()) {
  // eslint-disable-next-line unicorn/prefer-top-level-await -- CLI entrypoint
  runCli().catch((error) => {
    process.stderr.write(`Error running adr-lint: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}
