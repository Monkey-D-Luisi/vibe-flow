// tooling/manual/01-create-task.ts
import { handleToolCall } from '../../services/task-mcp/src/mcp/tools.ts';

const res = await handleToolCall('task.create', {
  title: 'E2E manual - minor fast-track',
  scope: 'minor',
  acceptance_criteria: ['Must pass the gate', 'Must create PR at the end']
});
console.log(JSON.stringify(res, null, 2));
