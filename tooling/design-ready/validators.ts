import type { DesignReadyDocument, PatternRef } from './types.js';

export interface DomainIssue {
  message: string;
  path: string;
  hint?: string;
}

export interface ValidationContext {
  patternIds: Set<string>;
  adrIds: Set<string>;
  sourcePath?: string;
}

export function validateDesignReadyDocument(
  document: DesignReadyDocument,
  context: ValidationContext,
): DomainIssue[] {
  const issues: DomainIssue[] = [];
  const moduleKeys = new Set(document.modules.map((m) => m.key));
  const contractIds = new Set(document.contracts.map((c) => c.id));

  checkMinCounts(document, issues);
  checkPatterns(document.patterns, context.patternIds, issues);
  checkAdrLinks(document.links?.adrs ?? [], context.adrIds, issues);
  checkContractModules(document, moduleKeys, issues);
  checkAcceptanceMapping(document, moduleKeys, contractIds, issues);

  return issues;
}

function checkMinCounts(doc: DesignReadyDocument, issues: DomainIssue[]): void {
  if (doc.modules.length < 3) {
    issues.push({
      message: 'Design document must declare at least 3 modules.',
      path: 'modules',
    });
  }

  if (doc.contracts.length < 3) {
    issues.push({
      message: 'Design document must declare at least 3 contracts.',
      path: 'contracts',
    });
  }

  const events = doc.contracts.filter((contract) => contract.kind === 'event');
  if (events.length === 0) {
    issues.push({
      message: 'At least one contract must describe an event publisher.',
      path: 'contracts',
      hint: 'Add an event contract with kind="event".',
    });
  }
}

function checkPatterns(patterns: PatternRef[], catalog: Set<string>, issues: DomainIssue[]): void {
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (seen.has(pattern.id)) {
      issues.push({
        message: `Pattern ${pattern.id} is listed more than once.`,
        path: `patterns.${pattern.id}`,
      });
      continue;
    }

    seen.add(pattern.id);

    if (!catalog.has(pattern.id)) {
      issues.push({
        message: `Pattern ${pattern.id} is not present in docs/patterns.`,
        path: `patterns.${pattern.id}`,
        hint: 'Run pnpm patterns:lint to sync the catalog.',
      });
    }
  }
}

function checkAdrLinks(adrs: string[], catalog: Set<string>, issues: DomainIssue[]): void {
  for (const adr of adrs) {
    if (!catalog.has(adr)) {
      issues.push({
        message: `Linked ADR ${adr} not found in docs/adr.`,
        path: `links.adrs.${adr}`,
        hint: `Ensure docs/adr/${adr}.md exists and has the correct id front-matter.`,
      });
    }
  }
}

function checkContractModules(
  document: DesignReadyDocument,
  moduleKeys: Set<string>,
  issues: DomainIssue[],
): void {
  for (const contract of document.contracts) {
    if (!moduleKeys.has(contract.module)) {
      issues.push({
        message: `Contract ${contract.id} references missing module ${contract.module}.`,
        path: `contracts.${contract.id}.module`,
        hint: `Declare module "${contract.module}" under modules[].key or fix the reference.`,
      });
    }
  }
}

function checkAcceptanceMapping(
  document: DesignReadyDocument,
  moduleKeys: Set<string>,
  contractIds: Set<string>,
  issues: DomainIssue[],
): void {
  document.test_plan.acceptance.forEach((caseItem) => {
    const location = `test_plan.acceptance.${caseItem.id}`;
    const relatesTo = caseItem.relates_to;
    if (relatesTo.module && !moduleKeys.has(relatesTo.module)) {
      issues.push({
        message: `Acceptance case ${caseItem.id} references unknown module ${relatesTo.module}.`,
        path: `${location}.relates_to.module`,
        hint: 'Update the module key or add the module definition.',
      });
    }

    if (relatesTo.contract && !contractIds.has(relatesTo.contract)) {
      issues.push({
        message: `Acceptance case ${caseItem.id} references unknown contract ${relatesTo.contract}.`,
        path: `${location}.relates_to.contract`,
        hint: 'Update the contract id or add the missing contract definition.',
      });
    }
  });
}
