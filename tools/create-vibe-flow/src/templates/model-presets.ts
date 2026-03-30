/**
 * Model Presets (EP30 Task 0193)
 *
 * Pre-configured model tier templates for create-vibe-flow CLI.
 * - free: GitHub Copilot proxy only (no API keys required)
 * - mixed: Copilot + one paid provider (balanced cost/quality)
 * - premium: Anthropic/OpenAI primary (best quality)
 */

export interface ModelPreset {
  readonly tier: 'free' | 'mixed' | 'premium';
  readonly label: string;
  readonly description: string;
  readonly models: Readonly<Record<string, ModelConfig>>;
  readonly qualityThresholds: QualityThresholds;
  readonly modelRouterEnabled: boolean;
}

export interface ModelConfig {
  readonly primary: string;
  readonly fallback?: string;
}

export interface QualityThresholds {
  readonly coverageMinor: number;
  readonly coverageMajor: number;
  readonly maxComplexity: number;
}

export const FREE_TIER_MODELS: ModelPreset = {
  tier: 'free',
  label: 'Free Tier (GitHub Copilot)',
  description: 'Uses GitHub Copilot models only. No API keys required. Quality may be lower for complex tasks.',
  models: {
    dev: { primary: 'github-copilot/gpt-4o' },
    qa: { primary: 'github-copilot/gpt-4o' },
  },
  qualityThresholds: {
    coverageMinor: 60,
    coverageMajor: 70,
    maxComplexity: 6.0,
  },
  modelRouterEnabled: false,
};

export const MIXED_MODELS: ModelPreset = {
  tier: 'mixed',
  label: 'Mixed Tier (Copilot + Paid)',
  description: 'Uses a paid model for complex tasks (dev) and Copilot for simpler tasks (qa). Good balance of cost and quality.',
  models: {
    dev: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'github-copilot/gpt-4o' },
    qa: { primary: 'github-copilot/gpt-4o' },
  },
  qualityThresholds: {
    coverageMinor: 70,
    coverageMajor: 80,
    maxComplexity: 5.0,
  },
  modelRouterEnabled: true,
};

export const PREMIUM_MODELS: ModelPreset = {
  tier: 'premium',
  label: 'Premium Tier (Anthropic/OpenAI)',
  description: 'Uses premium models for all agents. Best quality, highest cost.',
  models: {
    dev: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    qa: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
  },
  qualityThresholds: {
    coverageMinor: 70,
    coverageMajor: 80,
    maxComplexity: 5.0,
  },
  modelRouterEnabled: true,
};

export const MODEL_PRESETS: Record<string, ModelPreset> = {
  free: FREE_TIER_MODELS,
  mixed: MIXED_MODELS,
  premium: PREMIUM_MODELS,
};

/** Full-mode (8-agent) model presets. */
export const FULL_FREE_TIER_MODELS: ModelPreset = {
  tier: 'free',
  label: 'Free Tier - Full Team (GitHub Copilot)',
  description: 'All 8 agents use GitHub Copilot. No API keys required.',
  models: {
    pm: { primary: 'github-copilot/gpt-4o' },
    po: { primary: 'github-copilot/gpt-4o' },
    'tech-lead': { primary: 'github-copilot/gpt-4o' },
    designer: { primary: 'github-copilot/gpt-4o' },
    'back-1': { primary: 'github-copilot/gpt-4o' },
    qa: { primary: 'github-copilot/gpt-4o' },
    devops: { primary: 'github-copilot/gpt-4o' },
    system: { primary: 'github-copilot/gpt-4o' },
  },
  qualityThresholds: {
    coverageMinor: 60,
    coverageMajor: 70,
    maxComplexity: 6.0,
  },
  modelRouterEnabled: false,
};

export const FULL_MIXED_MODELS: ModelPreset = {
  tier: 'mixed',
  label: 'Mixed Tier - Full Team',
  description: 'Core agents use paid models, supporting agents use Copilot.',
  models: {
    pm: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'github-copilot/gpt-4o' },
    po: { primary: 'github-copilot/gpt-4o' },
    'tech-lead': { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'github-copilot/gpt-4o' },
    designer: { primary: 'github-copilot/gpt-4o' },
    'back-1': { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'github-copilot/gpt-4o' },
    qa: { primary: 'github-copilot/gpt-4o' },
    devops: { primary: 'github-copilot/gpt-4o' },
    system: { primary: 'github-copilot/gpt-4o' },
  },
  qualityThresholds: {
    coverageMinor: 70,
    coverageMajor: 80,
    maxComplexity: 5.0,
  },
  modelRouterEnabled: true,
};

export const FULL_PREMIUM_MODELS: ModelPreset = {
  tier: 'premium',
  label: 'Premium Tier - Full Team',
  description: 'All agents use premium models. Best quality.',
  models: {
    pm: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    po: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    'tech-lead': { primary: 'anthropic/claude-opus-4-6', fallback: 'anthropic/claude-sonnet-4-20250514' },
    designer: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    'back-1': { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    qa: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    devops: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
    system: { primary: 'anthropic/claude-sonnet-4-20250514', fallback: 'openai/gpt-4o' },
  },
  qualityThresholds: {
    coverageMinor: 70,
    coverageMajor: 80,
    maxComplexity: 5.0,
  },
  modelRouterEnabled: true,
};

/**
 * Select the best model preset based on detected API keys.
 */
export function autoDetectModelTier(providers: { hasAnthropic: boolean; hasOpenAI: boolean }): 'free' | 'mixed' | 'premium' {
  if (providers.hasAnthropic && providers.hasOpenAI) return 'premium';
  if (providers.hasAnthropic || providers.hasOpenAI) return 'mixed';
  return 'free';
}
