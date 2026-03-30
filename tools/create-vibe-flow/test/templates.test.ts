import { describe, it, expect } from 'vitest';
import { renderPackageJson } from '../src/templates/package-json.js';
import { renderGatewayConfig } from '../src/templates/gateway-config.js';
import { renderStartSh, renderStartPs1 } from '../src/templates/start-script.js';
import { renderReadme } from '../src/templates/readme.js';
import { autoDetectModelTier, FREE_TIER_MODELS, MIXED_MODELS, PREMIUM_MODELS } from '../src/templates/model-presets.js';
import { getAgentDefs } from '../src/templates/agent-defs.js';
import { getSkillRules } from '../src/templates/skill-rules.js';
import type { GenerateOptions } from '../src/types.js';

function makeOptions(overrides?: Partial<GenerateOptions>): GenerateOptions {
  return {
    projectName: 'test-project',
    projectDir: '/tmp/test-project',
    team: 'minimal',
    model: 'free',
    type: 'webapp',
    playground: false,
    force: false,
    ...overrides,
  };
}

describe('Template rendering', () => {
  describe('renderPackageJson', () => {
    it('produces valid JSON with project name', () => {
      const result = JSON.parse(renderPackageJson(makeOptions()));
      expect(result.name).toBe('test-project');
    });

    it('includes openclaw dependency', () => {
      const result = JSON.parse(renderPackageJson(makeOptions()));
      expect(result.dependencies.openclaw).toBeDefined();
    });

    it('includes start script', () => {
      const result = JSON.parse(renderPackageJson(makeOptions()));
      expect(result.scripts.start).toBeDefined();
    });
  });

  describe('renderGatewayConfig', () => {
    it('renders valid JSON for minimal free tier', () => {
      const config = JSON.parse(renderGatewayConfig(makeOptions({ team: 'minimal', model: 'free' })));
      expect(config.agents).toHaveLength(2);
      expect(config.extensions['@openclaw/model-router']).toBeUndefined();
    });

    it('renders valid JSON for full premium tier', () => {
      const config = JSON.parse(renderGatewayConfig(makeOptions({ team: 'full', model: 'premium' })));
      expect(config.agents.length).toBe(8);
      expect(config.extensions['@openclaw/model-router']).toBeDefined();
    });

    it('includes pipeline stages for minimal mode', () => {
      const config = JSON.parse(renderGatewayConfig(makeOptions({ team: 'minimal' })));
      const orchestrator = config.extensions['@openclaw/product-team'].orchestrator;
      expect(orchestrator.pipelineStages).toHaveLength(5);
    });

    it('does not include pipeline stages for full mode', () => {
      const config = JSON.parse(renderGatewayConfig(makeOptions({ team: 'full' })));
      const orchestrator = config.extensions['@openclaw/product-team'].orchestrator;
      expect(orchestrator.pipelineStages).toBeUndefined();
    });
  });

  describe('renderStartSh', () => {
    it('includes shebang', () => {
      expect(renderStartSh('my-app')).toContain('#!/usr/bin/env bash');
    });

    it('sets OPENCLAW_CONFIG_PATH', () => {
      expect(renderStartSh('my-app')).toContain('OPENCLAW_CONFIG_PATH');
    });
  });

  describe('renderStartPs1', () => {
    it('sets OPENCLAW_CONFIG_PATH', () => {
      expect(renderStartPs1('my-app')).toContain('OPENCLAW_CONFIG_PATH');
    });
  });

  describe('renderReadme', () => {
    it('includes project name', () => {
      expect(renderReadme(makeOptions())).toContain('# test-project');
    });

    it('describes minimal team', () => {
      expect(renderReadme(makeOptions({ team: 'minimal' }))).toContain('2-agent');
    });

    it('describes full team', () => {
      expect(renderReadme(makeOptions({ team: 'full' }))).toContain('8-agent');
    });
  });
});

describe('Model presets', () => {
  it('free tier disables model router', () => {
    expect(FREE_TIER_MODELS.modelRouterEnabled).toBe(false);
  });

  it('mixed tier enables model router', () => {
    expect(MIXED_MODELS.modelRouterEnabled).toBe(true);
  });

  it('premium tier enables model router', () => {
    expect(PREMIUM_MODELS.modelRouterEnabled).toBe(true);
  });

  it('free tier has lower coverage thresholds', () => {
    expect(FREE_TIER_MODELS.qualityThresholds.coverageMinor).toBeLessThan(
      PREMIUM_MODELS.qualityThresholds.coverageMinor,
    );
  });
});

describe('autoDetectModelTier', () => {
  it('returns premium for both keys', () => {
    expect(autoDetectModelTier({ hasAnthropic: true, hasOpenAI: true })).toBe('premium');
  });

  it('returns mixed for one key', () => {
    expect(autoDetectModelTier({ hasAnthropic: true, hasOpenAI: false })).toBe('mixed');
    expect(autoDetectModelTier({ hasAnthropic: false, hasOpenAI: true })).toBe('mixed');
  });

  it('returns free for no keys', () => {
    expect(autoDetectModelTier({ hasAnthropic: false, hasOpenAI: false })).toBe('free');
  });
});

describe('Agent definitions', () => {
  it('minimal has 2 agents', () => {
    expect(getAgentDefs('minimal')).toHaveLength(2);
  });

  it('full has 7 agents', () => {
    expect(getAgentDefs('full')).toHaveLength(7);
  });
});

describe('Skill rules', () => {
  it('minimal has fewer skills', () => {
    expect(getSkillRules('minimal').length).toBeLessThan(getSkillRules('full').length);
  });
});
