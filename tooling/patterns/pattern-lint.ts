import { promises as fs, Dirent, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';

type PatternStatus = 'draft' | 'accepted' | 'deprecated';
type PatternCategory = 'resilience' | 'messaging' | 'data' | 'integration' | 'ui' | 'security' | 'ops';

type Severity = 'error' | 'warning';

interface LintIssue {
  file: string;
  message: string;
  hint?: string;
  severity: Severity;
}

interface LintSummary {
  issues: LintIssue[];
  checked: number;
  skipped: number;
  targetFiles: string[];
}

interface PatternMetadata {
  id: string;
  slug: string;
  title: string;
  category: PatternCategory;
  status: PatternStatus;
  created: string;
  updated: string;
  adr_refs: string[];
  related: string[];
  tags: string[];
  owner: string;
  [key: string]: unknown;
}

interface PatternDocument {
  path: string;
  fileName: string;
  idFromPath: string;
  slugFromPath: string;
  body: string;
  rawFrontMatter: string;
  metadata?: PatternMetadata;
}

const PATTERN_FILE_PATTERN = /^P-(\d{4})-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.md$/i;
const ID_PATTERN = /^P-\d{4}$/;
const ADR_ID_PATTERN = /^ADR-\d{4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_STATUSES: readonly PatternStatus[] = ['draft', 'accepted', 'deprecated'];
const ALLOWED_CATEGORIES: readonly PatternCategory[] = ['resilience', 'messaging', 'data', 'integration', 'ui', 'security', 'ops'];
const REQUIRED_HEADINGS = [
  '## Intent',
  '## Context',
  '## Problem',
  '## Solution sketch',
  '## When to use',
  '## When not to use',
  '## Trade-offs',
  '## Operational notes',
  '## Known issues',
  '## References',
];
const TRADE_OFF_KEYS = ['Cost', 'Complexity', 'Latency', 'Throughput', 'Reliability', 'Scalability', 'Security', 'Operability'];

function patternDirectory(): string {
  return path.join(process.cwd(), 'docs', 'patterns');
}
function adrDirectory(): string {
  return path.join(process.cwd(), 'docs', 'adr');
}

const CLI_DESCRIPTION = `Pattern Catalog Linter

Usage:
  pnpm patterns:lint [options] [paths...]

Options:
  --changed        Lint only pattern files changed in git.
  --json           Output the result as JSON.
  --help           Display this help message.
`;

export async function lintRepository(targetFiles?: Set<string>): Promise<LintSummary> {
  const { documents, issues: loadIssues } = await loadPatternDocuments();
  const normalizedTargets = targetFiles ?? new Set(documents.map((doc) => doc.path));

  const issues: LintIssue[] = [...loadIssues];
  const patternIndex = new Map<string, PatternDocument>();

  for (const doc of documents) {
    const metaResult = await parseMetadata(doc);
    doc.metadata = metaResult.metadata;
    issues.push(...metaResult.issues);

    if (doc.metadata) {
      const existing = patternIndex.get(doc.metadata.id);
      if (existing) {
        issues.push(
          createIssue(
            doc.path,
            `Duplicate pattern id ${doc.metadata.id}.`,
            `First defined in ${relativePath(existing.path)}.`,
          ),
        );
      } else {
        patternIndex.set(doc.metadata.id, doc);
      }
    }
  }

  for (const doc of documents) {
    if (!normalizedTargets.has(doc.path)) {
      continue;
    }
    issues.push(...validateDocument(doc, patternIndex));
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

async function loadPatternDocuments(): Promise<{ documents: PatternDocument[]; issues: LintIssue[] }> {
  let entries: Dirent[];
  const directory = patternDirectory();
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Pattern directory not found: ${relativePath(directory)}.`);
    }
    throw error;
  }

  const documents: PatternDocument[] = [];
  const issues: LintIssue[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (['_TEMPLATE.md', 'README.md', 'catalog.yml'].includes(entry.name)) {
      continue;
    }

    if (!PATTERN_FILE_PATTERN.test(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    const fileContent = await fs.readFile(absolutePath, 'utf8');

    let frontMatter: string;
    let body: string;
    try {
      ({ frontMatter, body } = extractFrontMatter(fileContent));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid front matter.';
      issues.push(createIssue(absolutePath, message));
      continue;
    }

    documents.push({
      path: absolutePath,
      fileName: entry.name,
      idFromPath: `P-${entry.name.slice(2, 6)}`,
      slugFromPath: entry.name.slice(7, -3),
      body,
      rawFrontMatter: frontMatter,
    });
  }

  return {
    documents: documents.sort((a, b) => a.fileName.localeCompare(b.fileName)),
    issues,
  };
}

function extractFrontMatter(content: string): { frontMatter: string; body: string } {
  const normalized = content.replace(/\r\n/g, '\n').trimStart();
  if (!normalized.startsWith('---\n')) {
    throw new Error('File must begin with YAML front matter.');
  }

  const closingIndex = normalized.indexOf('\n---', 4);
  if (closingIndex === -1) {
    throw new Error('Front matter missing closing delimiter.');
  }

  const frontMatter = normalized.slice(4, closingIndex);
  let body = normalized.slice(closingIndex + 4);
  if (body.startsWith('\n')) {
    body = body.slice(1);
  }

  return { frontMatter, body };
}

async function parseMetadata(doc: PatternDocument): Promise<{ metadata?: PatternMetadata; issues: LintIssue[] }> {
  const issues: LintIssue[] = [];
  if (!doc.rawFrontMatter) {
    issues.push(createIssue(doc.path, 'Front matter is missing.'));
    return { issues };
  }

  let metadataObject: unknown;
  try {
    metadataObject = parseYaml(doc.rawFrontMatter);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error while parsing YAML.';
    issues.push(createIssue(doc.path, `Invalid front matter: ${message}`));
    return { issues };
  }

  if (!isPlainObject(metadataObject)) {
    issues.push(createIssue(doc.path, 'Front matter must be a YAML object.'));
    return { issues };
  }

  const metadata = metadataObject as Record<string, unknown>;

  const id = metadata.id;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    issues.push(createIssue(doc.path, 'Field `id` must follow P-0000 format.'));
  }

  const slug = metadata.slug;
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    issues.push(createIssue(doc.path, 'Field `slug` must be kebab-case.'));
  }

  const title = metadata.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    issues.push(createIssue(doc.path, 'Field `title` is required.'));
  }

  const category = metadata.category;
  if (typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category as PatternCategory)) {
    issues.push(
      createIssue(
        doc.path,
        `Invalid category "${String(category)}".`,
        `Choose one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
      ),
    );
  }

  const status = metadata.status;
  if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status as PatternStatus)) {
    issues.push(
      createIssue(
        doc.path,
        `Invalid status "${String(status)}".`,
        `Choose one of: ${ALLOWED_STATUSES.join(', ')}.`,
      ),
    );
  }

  const created = metadata.created;
  if (typeof created !== 'string' || !DATE_PATTERN.test(created)) {
    issues.push(createIssue(doc.path, 'Field `created` must be YYYY-MM-DD.'));
  }

  const updated = metadata.updated;
  if (typeof updated !== 'string' || !DATE_PATTERN.test(updated)) {
    issues.push(createIssue(doc.path, 'Field `updated` must be YYYY-MM-DD.'));
  }

  const adrRefs = normalizeStringArray(metadata.adr_refs);
  if (!adrRefs) {
    issues.push(createIssue(doc.path, 'Field `adr_refs` must be a list of strings.'));
  } else {
    for (const ref of adrRefs) {
      if (!ADR_ID_PATTERN.test(ref)) {
        issues.push(createIssue(doc.path, `Invalid ADR reference: ${ref}.`));
      }
    }
  }

  const related = normalizeStringArray(metadata.related);
  if (!related) {
    issues.push(createIssue(doc.path, 'Field `related` must be a list (empty list if none).'));
  } else {
    for (const item of related) {
      if (!SLUG_PATTERN.test(item)) {
        issues.push(createIssue(doc.path, `Invalid related slug: ${item}.`));
      }
    }
  }

  const tags = normalizeStringArray(metadata.tags);
  if (!tags) {
    issues.push(createIssue(doc.path, 'Field `tags` must be a list (empty list if none).'));
  }

  const owner = metadata.owner;
  if (typeof owner !== 'string' || owner.trim().length === 0) {
    issues.push(createIssue(doc.path, 'Field `owner` is required.'));
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    metadata: {
      id: id as string,
      slug: slug as string,
      title: title as string,
      category: category as PatternCategory,
      status: status as PatternStatus,
      created: created as string,
      updated: updated as string,
      adr_refs: adrRefs ?? [],
      related: related ?? [],
      tags: tags ?? [],
      owner: owner as string,
    },
    issues,
  };
}

function validateDocument(doc: PatternDocument, index: Map<string, PatternDocument>): LintIssue[] {
  const issues: LintIssue[] = [];
  const metadata = doc.metadata;

  if (!metadata) {
    return issues;
  }

  if (metadata.id !== doc.idFromPath) {
    issues.push(
      createIssue(
        doc.path,
        `Front matter id (${metadata.id}) does not match file name (${doc.idFromPath}).`,
      ),
    );
  }

  if (metadata.slug !== doc.slugFromPath) {
    issues.push(
      createIssue(
        doc.path,
        `Front matter slug (${metadata.slug}) does not match file name slug (${doc.slugFromPath}).`,
      ),
    );
  }

  if (metadata.status === 'deprecated' && metadata.related.length === 0) {
    issues.push(createIssue(doc.path, 'Deprecated patterns must list an alternative in `related`.'));
  }

  issues.push(...validateHeadings(doc));
  issues.push(...validateTradeOffs(doc));
  issues.push(...validateLists(doc));
  issues.push(...validateReferences(doc, metadata));
  issues.push(...validateAdrRefsExist(doc, metadata));

  return issues;
}

function validateHeadings(doc: PatternDocument): LintIssue[] {
  const issues: LintIssue[] = [];
  const positions: number[] = [];

  for (const heading of REQUIRED_HEADINGS) {
    const index = doc.body.indexOf(heading);
    if (index === -1) {
      issues.push(createIssue(doc.path, `Missing heading "${heading}".`));
    } else {
      positions.push(index);
    }
  }

  if (positions.length === REQUIRED_HEADINGS.length) {
    for (let i = 1; i < positions.length; i += 1) {
      if (positions[i] < positions[i - 1]) {
        issues.push(createIssue(doc.path, 'Headings are out of order. Follow the template sequence.'));
        break;
      }
    }
  }

  return issues;
}

function validateTradeOffs(doc: PatternDocument): LintIssue[] {
  const issues: LintIssue[] = [];
  const tradeOffSection = extractSection(doc.body, '## Trade-offs');

  if (!tradeOffSection) {
    return issues;
  }

  for (const key of TRADE_OFF_KEYS) {
    const pattern = new RegExp(`^-\\s+${key}:`, 'im');
    if (!pattern.test(tradeOffSection)) {
      issues.push(createIssue(doc.path, `Trade-offs section must include "${key}:".`));
    }
  }

  return issues;
}

function validateLists(doc: PatternDocument): LintIssue[] {
  const issues: LintIssue[] = [];

  for (const heading of ['## When to use', '## When not to use']) {
    const section = extractSection(doc.body, heading);
    if (section) {
      const bulletCount = (section.match(/^- /gm) ?? []).length;
      if (bulletCount === 0) {
        issues.push(createIssue(doc.path, `${heading} must include at least one bullet point.`));
      }
    }
  }

  const intentSection = extractSection(doc.body, '## Intent');
  if (!intentSection || !intentSection.trim()) {
    issues.push(createIssue(doc.path, 'Intent section must not be empty.'));
  }

  const solutionSection = extractSection(doc.body, '## Solution sketch');
  if (!solutionSection || !solutionSection.trim()) {
    issues.push(createIssue(doc.path, 'Solution sketch section must not be empty.'));
  }

  return issues;
}

function validateReferences(doc: PatternDocument, metadata: PatternMetadata): LintIssue[] {
  const issues: LintIssue[] = [];
  const referenceSection = extractSection(doc.body, '## References');

  if (!referenceSection || !referenceSection.trim()) {
    issues.push(createIssue(doc.path, 'References section must not be empty.'));
    return issues;
  }

  const bulletCount = (referenceSection.match(/^- /gm) ?? []).length;
  if (bulletCount === 0) {
    issues.push(createIssue(doc.path, 'References section must include bullet items.'));
  }

  if (metadata.status === 'deprecated') {
    const hasPatternLink = /\[.+\]\(\.\/P-\d{4}-[a-z0-9-]+\.md\)/.test(referenceSection);
    if (!hasPatternLink) {
      issues.push(createIssue(doc.path, 'Deprecated patterns must reference a replacement pattern in References.'));
    }
  }

  return issues;
}

function validateAdrRefsExist(doc: PatternDocument, metadata: PatternMetadata): LintIssue[] {
  const issues: LintIssue[] = [];
  if (metadata.adr_refs.length === 0) {
    issues.push({
      file: relativePath(doc.path),
      message: 'Pattern has no ADR references.',
      hint: 'Consider linking to the ADR that introduced or governs this pattern.',
      severity: 'warning',
    });
    return issues;
  }

  const adrFiles = listAdrFiles();
  for (const adrId of metadata.adr_refs) {
    if (!adrFiles.some((file) => file.startsWith(`${adrId}-`))) {
      issues.push(
        createIssue(
          doc.path,
          `Referenced ADR ${adrId} not found.`,
          'Ensure the ADR exists under docs/adr/ with a matching id.',
        ),
      );
    }
  }

  return issues;
}

function listAdrFiles(): string[] {
  try {
    return execFileSync('git', ['ls-files', '--', 'docs/adr'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => path.basename(line));
  } catch {
    // Fallback to directory read if git command fails.
    try {
      return readdirSync(adrDirectory()).filter((name) => name.endsWith('.md'));
    } catch {
      return [];
    }
  }
}

function extractSection(body: string, heading: string): string | undefined {
  const startIndex = body.indexOf(heading);
  if (startIndex === -1) {
    return undefined;
  }

  const afterHeading = body.slice(startIndex + heading.length);
  const nextHeadingIndex = afterHeading.indexOf('\n## ');
  if (nextHeadingIndex === -1) {
    return afterHeading.trim();
  }
  return afterHeading.slice(0, nextHeadingIndex).trim();
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const trimmed = value.map((item) => (typeof item === 'string' ? item.trim() : null));
  if (trimmed.some((item) => item === null)) {
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

function relativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function resolveTargetSet(args: { files: string[]; changed: boolean }): Set<string> {
  const targets = new Set<string>();

  if (args.files.length > 0) {
    for (const input of args.files) {
      const resolved = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
      targets.add(resolved);
    }
    return targets;
  }

  if (args.changed) {
    for (const changedFile of getChangedPatternFiles()) {
      targets.add(path.join(process.cwd(), changedFile));
    }
    if (targets.size > 0) {
      return targets;
    }
  }

  return targets;
}

function getChangedPatternFiles(): string[] {
  try {
    const output = execFileSync('git', ['status', '--porcelain', '--', 'docs/patterns'], {
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
      .filter((file) => PATTERN_FILE_PATTERN.test(path.basename(file)))
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
  });

  if (values.help) {
    process.stdout.write(CLI_DESCRIPTION);
    return;
  }

  const requestedTargets = resolveTargetSet({ files: positionals, changed: Boolean(values.changed) });
  const summary = await lintRepository(requestedTargets.size ? requestedTargets : undefined);

  if (values.json) {
    process.stdout.write(JSON.stringify(summary, null, 2));
  } else {
    renderSummary(summary);
  }

  process.exit(summary.issues.some((issue) => issue.severity === 'error') ? 1 : 0);
}

function renderSummary(summary: LintSummary): void {
  if (summary.issues.length === 0) {
    process.stdout.write(`Pattern lint passed (${summary.checked} files checked, ${summary.skipped} skipped).\n`);
    return;
  }

  for (const issue of summary.issues) {
    const prefix = issue.severity === 'error' ? '[error]' : '[warn]';
    process.stdout.write(`${prefix} ${issue.file}: ${issue.message}\n`);
    if (issue.hint) {
      process.stdout.write(`        hint: ${issue.hint}\n`);
    }
  }

  process.stdout.write(`\nFound ${summary.issues.length} issue(s) across ${summary.checked} files (${summary.skipped} skipped).\n`);
}

if (import.meta.url === pathToFileUrl(process.argv[1] ?? '')) {
  // eslint-disable-next-line unicorn/prefer-top-level-await -- CLI entrypoint
  runCli().catch((error) => {
    process.stderr.write(`Error running patterns-lint: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

function pathToFileUrl(filePath: string): string {
  const resolved = path.resolve(filePath);
  const url = new URL(`file://${resolved.replace(/\\/g, '/')}`);
  return url.href;
}
