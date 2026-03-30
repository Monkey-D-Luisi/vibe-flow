/**
 * Shared types for create-vibe-flow CLI (EP30 Task 0191)
 */

export type TeamSize = 'minimal' | 'full';
export type ModelTier = 'free' | 'mixed' | 'premium';
export type ProjectType = 'webapp' | 'api' | 'cli' | 'lib';

export interface GenerateOptions {
  readonly projectName: string;
  readonly projectDir: string;
  readonly team: TeamSize;
  readonly model: ModelTier;
  readonly type: ProjectType;
  readonly playground: boolean;
  readonly force: boolean;
}

export interface DetectedProviders {
  readonly hasAnthropic: boolean;
  readonly hasOpenAI: boolean;
  readonly hasGithubCopilot: boolean;
}

export interface CLIFlags {
  readonly projectName?: string;
  readonly team?: TeamSize;
  readonly model?: ModelTier;
  readonly type?: ProjectType;
  readonly playground: boolean;
  readonly defaults: boolean;
  readonly force: boolean;
  readonly help: boolean;
}
