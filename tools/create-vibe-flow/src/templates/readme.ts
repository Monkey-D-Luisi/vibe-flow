/**
 * README template (EP30 Task 0191)
 */

import type { GenerateOptions } from '../types.js';

export function renderReadme(options: GenerateOptions): string {
  const teamDesc = options.team === 'minimal' ? '2-agent minimal' : '8-agent full';
  const modelDesc = options.model === 'free' ? 'GitHub Copilot (free)' : options.model === 'mixed' ? 'Mixed (Copilot + paid)' : 'Premium (Anthropic/OpenAI)';

  return `# ${options.projectName}

A vibe-flow project powered by [OpenClaw](https://openclaw.ai).

## Configuration

| Setting | Value |
|---------|-------|
| Team | ${teamDesc} |
| Models | ${modelDesc} |
| Type | ${options.type} |

## Getting Started

\`\`\`bash
# Start the gateway
npm start

# Or with file watching
npm run start:dev
\`\`\`

## Project Structure

- \`openclaw.json\` — Gateway and agent configuration
- \`.env\` — API keys (gitignored)
- \`scripts/\` — Start scripts for Unix and Windows

## Agents

${options.team === 'minimal'
    ? `This project uses a **minimal 2-agent** setup:
- **dev** — Handles planning, implementation, and DevOps
- **qa** — Handles testing and code review`
    : `This project uses the **full 8-agent** team:
- **pm** — Product Manager
- **po** — Product Owner  
- **tech-lead** — Tech Lead
- **designer** — UI Designer
- **back-1** — Backend Developer
- **qa** — QA Engineer
- **devops** — DevOps Engineer`}

## Learn More

- [OpenClaw Documentation](https://openclaw.ai/docs)
- [Free-Tier Mode Guide](https://openclaw.ai/docs/guides/free-tier-mode)
- [Extension API Reference](https://openclaw.ai/docs/api-reference)
`;
}
