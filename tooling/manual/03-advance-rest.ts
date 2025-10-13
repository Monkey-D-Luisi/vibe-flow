// tooling/manual/03-advance-rest.ts
import { handleToolCall } from '../../services/task-mcp/src/mcp/tools.ts';

const id = process.argv[2];
if (!id) throw new Error('Usage: tsx 03-advance-rest.ts <taskId>');

const step = async (to: string, evidence: any) => {
  const res = await handleToolCall('task.transition', { id, to, evidence });
  console.log(`${to} ✓`);
  return res;
};

await step('po_check', { violations: [] });
await step('qa', { acceptance_criteria_met: true, qa_report: { pass: true } });
await step('pr', { pr: { title: 'E2E manual', checklist: ['gate ok','qa ok'] } });
await step('done', { merged: true });

const final = await handleToolCall('task.get', { id });
console.log(JSON.stringify(final, null, 2));
