import { Type, type Static } from '@sinclair/typebox';

export const ProjectListParams = Type.Object({});
export type ProjectListParams = Static<typeof ProjectListParams>;

export const ProjectSwitchParams = Type.Object({
  projectId: Type.String({ minLength: 1, description: 'ID of the project to switch to' }),
});
export type ProjectSwitchParams = Static<typeof ProjectSwitchParams>;

export const ProjectRegisterParams = Type.Object({
  id: Type.String({ minLength: 1, description: 'Unique project identifier' }),
  name: Type.String({ minLength: 1, description: 'Human-readable project name' }),
  repo: Type.String({ minLength: 1, description: 'GitHub owner/repo (e.g. "luiss/vibe-flow")' }),
  defaultBranch: Type.Optional(Type.String({ description: 'Default branch name (defaults to "main")' })),
  workspace: Type.Optional(Type.String({ description: 'Workspace directory path' })),
  stitch: Type.Optional(Type.Object({
    projectId: Type.Union([Type.String(), Type.Null()]),
  })),
  quality: Type.Optional(Type.Object({
    coverageMajor: Type.Optional(Type.Number()),
    coverageMinor: Type.Optional(Type.Number()),
    maxComplexity: Type.Optional(Type.Number()),
  })),
});
export type ProjectRegisterParams = Static<typeof ProjectRegisterParams>;
