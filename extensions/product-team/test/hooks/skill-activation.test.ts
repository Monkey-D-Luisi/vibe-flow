import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSkillInstructions,
  resetSkillRulesCache,
} from '../../src/hooks/skill-activation.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', '..', 'src', 'skills', 'skill-rules.json');

describe('skill-activation', () => {
  beforeEach(() => {
    resetSkillRulesCache();
  });

  it('should return instructions for QA stage + qa agent', () => {
    const result = getSkillInstructions('QA', 'qa', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('qa-testing');
    expect(result).toContain('qa_report');
    expect(result).toContain('agent-eval');
  });

  it('should return instructions for IMPLEMENTATION stage + back-1 agent', () => {
    const result = getSkillInstructions('IMPLEMENTATION', 'back-1', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('backend-dev');
    expect(result).toContain('tdd-implementation');
    expect(result).toContain('dev_result');
  });

  it('should return instructions for IMPLEMENTATION stage + front-1 agent', () => {
    const result = getSkillInstructions('IMPLEMENTATION', 'front-1', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('frontend-dev');
    expect(result).toContain('tdd-implementation');
    expect(result).toContain('design_get');
  });

  it('should return instructions for REVIEW stage + tech-lead agent', () => {
    const result = getSkillInstructions('REVIEW', 'tech-lead', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('code-review');
    expect(result).toContain('review_result');
  });

  it('should return instructions for DECOMPOSITION stage + tech-lead agent', () => {
    const result = getSkillInstructions('DECOMPOSITION', 'tech-lead', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('architecture_plan');
  });

  it('should return instructions for REFINEMENT stage + po agent', () => {
    const result = getSkillInstructions('REFINEMENT', 'po', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('po_brief');
  });

  it('should return instructions for SHIPPING stage + devops agent', () => {
    const result = getSkillInstructions('SHIPPING', 'devops', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('vcs_branch_create');
  });

  it('should return instructions for DESIGN stage + designer agent', () => {
    const result = getSkillInstructions('DESIGN', 'designer', RULES_PATH);
    expect(result).not.toBeNull();
    expect(result).toContain('GEMINI_3_PRO');
  });

  it('should return null for unknown stage', () => {
    const result = getSkillInstructions('UNKNOWN_STAGE', 'qa', RULES_PATH);
    expect(result).toBeNull();
  });

  it('should return null for unmapped agent', () => {
    const result = getSkillInstructions('QA', 'unknown-agent', RULES_PATH);
    expect(result).toBeNull();
  });

  it('should return null for valid stage but wrong agent', () => {
    const result = getSkillInstructions('QA', 'back-1', RULES_PATH);
    expect(result).toBeNull();
  });

  it('should cache rules after first load', () => {
    const result1 = getSkillInstructions('QA', 'qa', RULES_PATH);
    const result2 = getSkillInstructions('QA', 'qa', RULES_PATH);
    expect(result1).toBe(result2);
  });
});
