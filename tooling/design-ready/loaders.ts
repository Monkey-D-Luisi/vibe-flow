import { Dirent, promises as fs } from 'node:fs';
import path from 'node:path';

import type { DesignReadyDocument, PatternRef } from './types.js';
import { parseFrontMatter } from './front-matter.js';

function getRepoRoot(): string {
  return path.resolve(process.cwd());
}

export interface DesignReadySource {
  document: DesignReadyDocument;
  sourcePath: string;
}

interface DesignReadyFrontMatter {
  design_ready?: Omit<DesignReadyDocument, 'version'> & Partial<Pick<DesignReadyDocument, 'version'>>;
}

export async function loadDesignReadySources(patternCatalog?: Set<string>): Promise<DesignReadySource[]> {
  const specs = await findSpecFiles();
  const patternSet = patternCatalog ?? (await loadPatternIds());
  const sources: DesignReadySource[] = [];

  for (const specPath of specs) {
    const raw = await fs.readFile(specPath, 'utf8');
    const { attributes } = parseFrontMatter<DesignReadyFrontMatter>(raw);

    if (!attributes?.design_ready) {
      continue;
    }

    const normalized = normalizeDocument(attributes.design_ready, patternSet);
    sources.push({ document: normalized, sourcePath: specPath });
  }

  return sources;
}

export async function loadPatternIds(): Promise<Set<string>> {
  const patternDir = path.join(getRepoRoot(), 'docs', 'patterns');
  const entries = await fs.readdir(patternDir, { withFileTypes: true });
  const ids = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('P-') || !entry.name.endsWith('.md')) {
      continue;
    }

    const fullPath = path.join(patternDir, entry.name);
    const match = await readIdFromFrontMatter(fullPath);
    if (match) {
      ids.add(match);
    }
  }

  return ids;
}

export async function loadAdrIds(): Promise<Set<string>> {
  const adrDir = path.join(getRepoRoot(), 'docs', 'adr');
  const entries = await fs.readdir(adrDir, { withFileTypes: true });
  const ids = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('ADR-') || !entry.name.endsWith('.md')) {
      continue;
    }

    const fullPath = path.join(adrDir, entry.name);
    const match = await readIdFromFrontMatter(fullPath);
    if (match) {
      ids.add(match);
    }
  }

  return ids;
}

async function readIdFromFrontMatter(filePath: string): Promise<string | null> {
  const raw = await fs.readFile(filePath, 'utf8');
  const { attributes } = parseFrontMatter<{ id?: string }>(raw);
  return attributes?.id ?? null;
}

async function findSpecFiles(): Promise<string[]> {
  const epicsDir = path.join(getRepoRoot(), 'docs', 'epics');
  const exists = await pathExists(epicsDir);

  if (!exists) {
    return [];
  }

  const matches: string[] = [];
  await walk(epicsDir, async (entry, parent) => {
    if (entry.isFile() && entry.name === '10-spec.md') {
      matches.push(path.join(parent, entry.name));
    }
  });

  return matches.sort((a, b) => a.localeCompare(b));
}

async function walk(dir: string, onDirent: (entry: Dirent, parent: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    await onDirent(entry, dir);

    if (entry.isDirectory()) {
      await walk(fullPath, onDirent);
    }
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function normalizeDocument(
  partial: Omit<DesignReadyDocument, 'version'> & Partial<Pick<DesignReadyDocument, 'version'>>,
  patternCatalog: Set<string>,
): DesignReadyDocument {
  const version = partial.version ?? 1;

  const patterns = (partial.patterns ?? []).map((pattern) => normalizePattern(pattern, patternCatalog));

  const doc: DesignReadyDocument = {
    ...partial,
    version,
    patterns,
  };

  return doc;
}

function normalizePattern(pattern: PatternRef, catalog: Set<string>): PatternRef {
  if (!catalog.has(pattern.id)) {
    return pattern;
  }

  return pattern;
}
