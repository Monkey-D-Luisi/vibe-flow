import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishScoringRecommendation,
  getScoringRecommendation,
  listScoringRecommendations,
  clearScoringStates,
} from '../src/scoring-integration.js';

const NOW = '2026-03-09T12:00:00.000Z';

describe('scoring-integration (globalThis registry)', () => {
  beforeEach(() => {
    clearScoringStates();
  });

  it('publishes and retrieves a scoring recommendation', () => {
    publishScoringRecommendation({
      agentId: 'back-1',
      taskType: 'IMPLEMENTATION',
      recommendedModelId: 'claude-sonnet',
      score: 85,
      sampleSize: 10,
      confidence: 0.8,
      updatedAt: NOW,
    });

    const rec = getScoringRecommendation('back-1', 'IMPLEMENTATION');
    expect(rec).not.toBeUndefined();
    expect(rec!.recommendedModelId).toBe('claude-sonnet');
    expect(rec!.score).toBe(85);
  });

  it('returns undefined for unknown agent x taskType', () => {
    const rec = getScoringRecommendation('unknown', 'IMPLEMENTATION');
    expect(rec).toBeUndefined();
  });

  it('overwrites existing recommendation on re-publish', () => {
    publishScoringRecommendation({
      agentId: 'back-1',
      taskType: 'IMPLEMENTATION',
      recommendedModelId: 'claude-sonnet',
      score: 85,
      sampleSize: 10,
      confidence: 0.8,
      updatedAt: NOW,
    });

    publishScoringRecommendation({
      agentId: 'back-1',
      taskType: 'IMPLEMENTATION',
      recommendedModelId: 'claude-opus',
      score: 95,
      sampleSize: 15,
      confidence: 0.9,
      updatedAt: NOW,
    });

    const rec = getScoringRecommendation('back-1', 'IMPLEMENTATION');
    expect(rec!.recommendedModelId).toBe('claude-opus');
    expect(rec!.score).toBe(95);
  });

  it('lists all recommendations', () => {
    publishScoringRecommendation({
      agentId: 'back-1',
      taskType: 'IMPLEMENTATION',
      recommendedModelId: 'claude-sonnet',
      score: 85,
      sampleSize: 10,
      confidence: 0.8,
      updatedAt: NOW,
    });

    publishScoringRecommendation({
      agentId: 'front-1',
      taskType: 'DESIGN',
      recommendedModelId: 'claude-haiku',
      score: 70,
      sampleSize: 8,
      confidence: 0.6,
      updatedAt: NOW,
    });

    const all = listScoringRecommendations();
    expect(all.length).toBe(2);
  });

  it('clears all state', () => {
    publishScoringRecommendation({
      agentId: 'back-1',
      taskType: 'IMPLEMENTATION',
      recommendedModelId: 'claude-sonnet',
      score: 85,
      sampleSize: 10,
      confidence: 0.8,
      updatedAt: NOW,
    });

    clearScoringStates();

    const all = listScoringRecommendations();
    expect(all.length).toBe(0);
  });
});
