/**
 * Interactive Setup Wizard (EP30 Task 0194)
 *
 * Zero-dependency interactive prompts using Node.js readline.
 */

import { createInterface } from 'node:readline';
import type { TeamSize, ModelTier, ProjectType } from './types.js';

export interface WizardAnswers {
  readonly projectName: string;
  readonly team: TeamSize;
  readonly model: ModelTier;
  readonly type: ProjectType;
}

interface PromptOption<T> {
  readonly key: string;
  readonly label: string;
  readonly value: T;
}

async function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askChoice<T>(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  options: readonly PromptOption<T>[],
  defaultIndex: number,
): Promise<T> {
  console.log(`\n  ${prompt}`);
  for (let i = 0; i < options.length; i++) {
    const marker = i === defaultIndex ? '●' : '○';
    console.log(`    ${marker} ${options[i]!.key}) ${options[i]!.label}`);
  }

  const answer = await ask(rl, `  Choice [${options[defaultIndex]!.key}]: `);
  if (!answer) return options[defaultIndex]!.value;

  const match = options.find((o) => o.key === answer.toLowerCase());
  return match ? match.value : options[defaultIndex]!.value;
}

export async function runWizard(defaultName?: string): Promise<WizardAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('');

    // 1. Project name
    const nameAnswer = await ask(rl, `  Project name [${defaultName ?? 'my-vibe-project'}]: `);
    const projectName = nameAnswer || defaultName || 'my-vibe-project';

    // 2. Team size
    const team = await askChoice<TeamSize>(rl, 'Team size:', [
      { key: '1', label: 'Minimal (2 agents: dev + qa) — recommended for new users', value: 'minimal' },
      { key: '2', label: 'Full (8 agents: pm, po, tech-lead, designer, dev, qa, devops)', value: 'full' },
    ], 0);

    // 3. Model tier
    const model = await askChoice<ModelTier>(rl, 'Model tier:', [
      { key: '1', label: 'Free (GitHub Copilot only, no API keys needed)', value: 'free' },
      { key: '2', label: 'Mixed (Copilot + one paid provider)', value: 'mixed' },
      { key: '3', label: 'Premium (Anthropic/OpenAI for all agents)', value: 'premium' },
    ], 0);

    // 4. Project type
    const type = await askChoice<ProjectType>(rl, 'Project type:', [
      { key: '1', label: 'Web Application', value: 'webapp' },
      { key: '2', label: 'REST API', value: 'api' },
      { key: '3', label: 'CLI Tool', value: 'cli' },
      { key: '4', label: 'Library', value: 'lib' },
    ], 0);

    return { projectName, team, model, type };
  } finally {
    rl.close();
  }
}
