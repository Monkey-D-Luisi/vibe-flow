/**
 * E2E Scenario: Happy Path
 *
 * Validates the full autonomous pipeline from idea to DONE:
 * IDEA → ROADMAP → REFINEMENT → DECOMPOSITION → DESIGN → IMPLEMENTATION → QA → REVIEW → SHIPPING → DONE
 *
 * Agents communicate via team.message at each stage transition.
 * Technical decisions are auto-resolved by the decision engine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPipelineHarness,
  nextCallId,
  type PipelineHarness,
} from '../helpers/pipeline-harness.js';
import {
  assertStage,
  assertInboxHasMessage,
  assertDecisionAutoResolved,
  assertDecisionLogged,
  assertMessageDelivered,
} from '../helpers/assertions.js';

describe('E2E: Happy Path — full pipeline IDEA → DONE', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('progresses through all pipeline stages with agent messages and auto decisions', async () => {
    const { tools, advanceToStage } = harness;

    // 1. PM submits idea and pipeline starts in IDEA stage
    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Add real-time collaboration to the canvas editor',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;
    expect(taskId).toBeTruthy();

    // Verify initial IDEA stage
    const ideaStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(ideaStatus, 'IDEA');

    // 2. PM advances to ROADMAP and notifies PO
    advanceToStage(taskId, 'ROADMAP');
    const notifyPo = await tools.teamMessage.execute(nextCallId(), {
      from: 'pm',
      to: 'po',
      subject: 'New roadmap item ready for refinement',
      body: 'Canvas collaboration feature has been prioritized. Please refine into user stories.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyPo);

    // 3. PO refines stories and advances to DECOMPOSITION
    advanceToStage(taskId, 'REFINEMENT');
    advanceToStage(taskId, 'DECOMPOSITION');
    const notifyTechLead = await tools.teamMessage.execute(nextCallId(), {
      from: 'po',
      to: 'tech-lead',
      subject: 'Stories refined — ready for task decomposition',
      body: '3 user stories with estimates totalling 16 points.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyTechLead);

    // 4. Tech Lead makes a technical decision (auto-resolved)
    const techDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'technical',
      question: 'Should we use WebSockets or Server-Sent Events for canvas sync?',
      options: [
        { id: 'ws', description: 'WebSockets: bidirectional, lower latency', pros: 'Real-time', cons: 'More complex' },
        { id: 'sse', description: 'SSE: simplex, easier to implement', pros: 'Simple', cons: 'One-directional' },
      ],
      recommendation: 'ws',
      reasoning: 'Canvas collaboration requires bidirectional sync — WebSockets is the right choice.',
      taskRef: taskId,
    });
    assertDecisionAutoResolved(techDecision);

    // 5. Tech Lead advances to DESIGN and notifies Designer
    advanceToStage(taskId, 'DESIGN');
    const notifyDesigner = await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'designer',
      subject: 'Design phase starting for canvas collaboration',
      body: 'Please create UI mockups for real-time cursor indicators and collaborative editing overlays.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyDesigner);

    // 6. Designer sends design to dev team and advances to IMPLEMENTATION
    advanceToStage(taskId, 'IMPLEMENTATION');
    const notifyDev = await tools.teamMessage.execute(nextCallId(), {
      from: 'designer',
      to: 'back-1',
      subject: 'Design ready for implementation',
      body: 'Stitch design is available. Canvas collaboration UI components are spec\'d out.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyDev);

    // 7. Backend Dev makes another technical decision (auto-resolved)
    const implDecision = await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'technical',
      question: 'Which CRDT library to use for conflict resolution?',
      options: [
        { id: 'yjs', description: 'Yjs: mature, well-tested CRDT', pros: 'Battle-tested' },
        { id: 'automerge', description: 'Automerge: newer, JSON-native', pros: 'JSON-native' },
      ],
      recommendation: 'yjs',
      taskRef: taskId,
    });
    assertDecisionAutoResolved(implDecision);

    // 8. Implementation completes, advance to QA
    advanceToStage(taskId, 'QA');
    const notifyQa = await tools.teamMessage.execute(nextCallId(), {
      from: 'back-1',
      to: 'qa',
      subject: 'Implementation complete — ready for QA',
      body: 'WebSocket server and cursor tracking implemented. 87% coverage.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyQa);

    // 9. QA passes, advance to REVIEW
    advanceToStage(taskId, 'REVIEW');
    const notifyReviewer = await tools.teamMessage.execute(nextCallId(), {
      from: 'qa',
      to: 'tech-lead',
      subject: 'QA passed — ready for review',
      body: 'All 47 tests pass. Coverage at 87.4%, above 80% threshold.',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyReviewer);

    // 10. Tech Lead approves and advances to SHIPPING
    advanceToStage(taskId, 'SHIPPING');
    const notifyDevOps = await tools.teamMessage.execute(nextCallId(), {
      from: 'tech-lead',
      to: 'devops',
      subject: 'Review approved — create PR',
      body: 'Code review passed. Please create PR with labels "feature" and "EP08".',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyDevOps);

    // 11. DevOps creates PR and marks DONE
    advanceToStage(taskId, 'DONE');
    const notifyTeam = await tools.teamMessage.execute(nextCallId(), {
      from: 'devops',
      to: 'pm',
      subject: 'PR created — pipeline complete',
      body: 'PR #101 created: https://github.com/owner/repo/pull/101',
      taskRef: taskId,
    });
    assertMessageDelivered(notifyTeam);

    // Final state: verify task is DONE
    const finalStatus = await tools.pipelineStatus.execute(nextCallId(), { taskId });
    assertStage(finalStatus, 'DONE');

    // Verify PM inbox has the completion message
    const pmInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'pm' });
    assertInboxHasMessage(pmInbox, 'PR created');

    // Verify decision log has both technical decisions
    const decisionAudit = await tools.decisionLog.execute(nextCallId(), { taskRef: taskId });
    assertDecisionLogged(decisionAudit, 'technical');

    // Verify tech-lead inbox has QA passed notification
    const tlInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'tech-lead' });
    assertInboxHasMessage(tlInbox, 'QA passed');
  });

  it('records all agent messages in the correct inboxes', async () => {
    const { tools, advanceToStage } = harness;

    const startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Improve search performance',
    });
    const { taskId } = (startResult as { details: { taskId: string } }).details;

    // Send a chain of cross-agent messages
    await tools.teamMessage.execute(nextCallId(), { from: 'pm', to: 'po', subject: 'Handoff to PO', body: 'Ready for refinement', taskRef: taskId });
    await tools.teamMessage.execute(nextCallId(), { from: 'po', to: 'tech-lead', subject: 'Stories ready', body: 'Please decompose', taskRef: taskId });
    await tools.teamMessage.execute(nextCallId(), { from: 'tech-lead', to: 'back-1', subject: 'Your task', body: 'Implement search index', taskRef: taskId });

    advanceToStage(taskId, 'IMPLEMENTATION');

    // Each agent's inbox should have exactly their messages
    const poInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'po' });
    assertInboxHasMessage(poInbox, 'Handoff to PO');

    const tlInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'tech-lead' });
    assertInboxHasMessage(tlInbox, 'Stories ready');

    const devInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'back-1' });
    assertInboxHasMessage(devInbox, 'Your task');

    // PM should have no messages (only sender)
    const pmInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'pm' });
    const pmMessages = (pmInbox as { details: { count: number } }).details.count;
    expect(pmMessages).toBe(0);
  });
});
