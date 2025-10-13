// tooling/manual/01-create-task.ts
import { handleToolCall } from '../../services/task-mcp/src/mcp/tools.ts';

const res = await handleToolCall('task.create', {
  title: 'E2E manual - minor fast-track',
  scope: 'minor',
  acceptance_criteria: ['Debe pasar el gate', 'Debe crear PR al final']
});
console.log(JSON.stringify(res, null, 2));
