/**
 * Config Builder (EP30 Task 0194)
 *
 * Builds GenerateOptions from wizard answers + detected providers.
 */

import { resolve } from 'node:path';
import type { GenerateOptions, DetectedProviders, ModelTier } from './types.js';
import type { WizardAnswers } from './wizard.js';
import { autoDetectModelTier } from './templates/model-presets.js';

/**
 * Merge wizard answers and detected providers into GenerateOptions.
 * If the user chose a model tier that requires unavailable providers,
 * fall back to auto-detected tier.
 */
export function buildConfig(
  answers: WizardAnswers,
  providers: DetectedProviders,
  flags: { playground: boolean; force: boolean },
): GenerateOptions {
  let model: ModelTier = answers.model;

  // Validate model choice against available providers
  if (model === 'premium' && !providers.hasAnthropic && !providers.hasOpenAI) {
    model = autoDetectModelTier(providers);
  }
  if (model === 'mixed' && !providers.hasAnthropic && !providers.hasOpenAI) {
    model = 'free';
  }

  return {
    projectName: answers.projectName,
    projectDir: resolve(process.cwd(), answers.projectName),
    team: answers.team,
    model,
    type: answers.type,
    playground: flags.playground,
    force: flags.force,
  };
}
