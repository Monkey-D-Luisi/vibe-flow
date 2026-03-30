/**
 * Gateway config template (EP30 Task 0191)
 *
 * Renders openclaw.json for the generated project.
 */

import type { GenerateOptions } from '../types.js';
import type { ModelPreset } from './model-presets.js';
import {
  FREE_TIER_MODELS, MIXED_MODELS, PREMIUM_MODELS,
  FULL_FREE_TIER_MODELS, FULL_MIXED_MODELS, FULL_PREMIUM_MODELS,
} from './model-presets.js';

function getPreset(options: GenerateOptions): ModelPreset {
  if (options.team === 'minimal') {
    switch (options.model) {
      case 'free': return FREE_TIER_MODELS;
      case 'mixed': return MIXED_MODELS;
      case 'premium': return PREMIUM_MODELS;
    }
  }
  switch (options.model) {
    case 'free': return FULL_FREE_TIER_MODELS;
    case 'mixed': return FULL_MIXED_MODELS;
    case 'premium': return FULL_PREMIUM_MODELS;
  }
}

export function renderGatewayConfig(options: GenerateOptions): string {
  const preset = getPreset(options);
  const agents = Object.entries(preset.models).map(([id, model]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    model: {
      primary: model.primary,
      ...(model.fallback ? { fallback: model.fallback } : {}),
    },
  }));

  const pipelineConfig = options.team === 'minimal'
    ? {
        pipelineStages: ['IDEA', 'DECOMPOSITION', 'IMPLEMENTATION', 'QA', 'DONE'],
        stageOwners: { IDEA: 'dev', DECOMPOSITION: 'dev', IMPLEMENTATION: 'dev', QA: 'qa', DONE: 'system' },
        coordinatorAgents: ['dev'],
        escalationTarget: 'dev',
      }
    : undefined;

  const config = {
    $schema: 'https://openclaw.ai/schemas/config.json',
    gateway: {
      port: 3000,
    },
    agents,
    extensions: {
      '@openclaw/product-team': {
        enabled: true,
        orchestrator: {
          ...(pipelineConfig ?? {}),
          coverageByScope: {
            minor: preset.qualityThresholds.coverageMinor,
            major: preset.qualityThresholds.coverageMajor,
          },
        },
      },
      '@openclaw/quality-gate': { enabled: true },
      ...(preset.modelRouterEnabled ? { '@openclaw/model-router': { enabled: true } } : {}),
    },
  };

  return JSON.stringify(config, null, 2) + '\n';
}
