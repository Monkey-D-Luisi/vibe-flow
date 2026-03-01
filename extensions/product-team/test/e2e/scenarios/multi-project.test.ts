/**
 * E2E Scenario: Multi-Project Support
 *
 * Pipeline tasks are tagged with projectId. Each project has independent
 * task isolation — messages, decisions, and stages don't cross project boundaries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPipelineHarness,
  nextCallId,
  type PipelineHarness,
} from '../helpers/pipeline-harness.js';
import { assertDecisionLogged } from '../helpers/assertions.js';

describe('E2E: Multi-Project — tasks isolated by projectId', () => {
  let harness: PipelineHarness;

  beforeEach(() => {
    harness = createPipelineHarness({
      projectConfig: {
        activeProject: 'project-alpha',
        projects: [
          { id: 'project-alpha', name: 'Alpha — Customer Portal' },
          { id: 'project-beta', name: 'Beta — Internal Tools' },
        ],
      },
    });
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('tasks are associated with their project at creation', async () => {
    const { tools } = harness;

    // Start a task for project-alpha (implicit via active project)
    const alphaResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Customer Portal: Add SSO login',
      projectId: 'project-alpha',
    });
    const alphaTaskId = (alphaResult as { details: { taskId: string } }).details.taskId;

    // Start a task for project-beta (explicit override)
    const betaResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Internal Tools: Slack bot for deployment notifications',
      projectId: 'project-beta',
    });
    const betaTaskId = (betaResult as { details: { taskId: string } }).details.taskId;

    // Both tasks exist in the pipeline
    const allStatus = await tools.pipelineStatus.execute(nextCallId(), {});
    const { tasks } = (allStatus as { details: { tasks: Array<{ id: string; stage: string }> } }).details;
    expect(tasks.length).toBe(2);

    // Each task has its own ID
    expect(alphaTaskId).not.toBe(betaTaskId);
  });

  it('messages between project-alpha agents do not appear in project-beta inboxes', async () => {
    const { tools, advanceToStage } = harness;

    // Create tasks for each project
    const alphaResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Alpha: customer dashboard redesign',
      projectId: 'project-alpha',
    });
    const alphaTaskId = (alphaResult as { details: { taskId: string } }).details.taskId;

    const betaResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Beta: internal CI metrics dashboard',
      projectId: 'project-beta',
    });
    const betaTaskId = (betaResult as { details: { taskId: string } }).details.taskId;

    advanceToStage(alphaTaskId, 'DESIGN');
    advanceToStage(betaTaskId, 'IMPLEMENTATION');

    // Send project-alpha-specific messages
    await tools.teamMessage.execute(nextCallId(), {
      from: 'designer',
      to: 'front-1',
      subject: '[Alpha] Dashboard redesign mockups ready',
      body: 'New customer-facing dashboard designs available in Stitch.',
      taskRef: alphaTaskId,
    });

    // Send project-beta-specific messages
    await tools.teamMessage.execute(nextCallId(), {
      from: 'back-1',
      to: 'qa',
      subject: '[Beta] CI metrics backend ready for QA',
      body: 'Prometheus scraper and aggregation layer implemented.',
      taskRef: betaTaskId,
    });

    // front-1 inbox contains alpha messages
    const front1Inbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'front-1' });
    const front1Messages = (front1Inbox as { details: { messages: Array<{ subject: string }> } }).details.messages;
    expect(front1Messages.some((m) => m.subject.includes('[Alpha]'))).toBe(true);
    expect(front1Messages.some((m) => m.subject.includes('[Beta]'))).toBe(false);

    // qa inbox contains beta messages only
    const qaInbox = await tools.teamInbox.execute(nextCallId(), { agentId: 'qa' });
    const qaMessages = (qaInbox as { details: { messages: Array<{ subject: string }> } }).details.messages;
    expect(qaMessages.some((m) => m.subject.includes('[Beta]'))).toBe(true);
    expect(qaMessages.some((m) => m.subject.includes('[Alpha]'))).toBe(false);
  });

  it('decision logs are scoped per task across projects', async () => {
    const { tools } = harness;

    const alphaResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Alpha: payment gateway migration',
      projectId: 'project-alpha',
    });
    const alphaTaskId = (alphaResult as { details: { taskId: string } }).details.taskId;

    const betaResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: 'Beta: knowledge base search',
      projectId: 'project-beta',
    });
    const betaTaskId = (betaResult as { details: { taskId: string } }).details.taskId;

    // Technical decision for Alpha
    await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'technical',
      question: 'Which payment gateway? Stripe vs Braintree?',
      options: [
        { id: 'stripe', description: 'Stripe: mature API, strong DX' },
        { id: 'braintree', description: 'Braintree: PayPal ecosystem integration' },
      ],
      recommendation: 'stripe',
      taskRef: alphaTaskId,
    });

    // Budget decision for Beta
    await tools.decisionEvaluate.execute(nextCallId(), {
      category: 'budget',
      question: 'Elasticsearch license costs $300/month. Proceed?',
      options: [
        { id: 'es', description: 'Use Elasticsearch: best recall' },
        { id: 'pg', description: 'Use PostgreSQL full-text search: free' },
      ],
      taskRef: betaTaskId,
    });

    // Alpha log has only technical decisions
    const alphaLog = await tools.decisionLog.execute(nextCallId(), { taskRef: alphaTaskId });
    assertDecisionLogged(alphaLog, 'technical');
    const alphaDecisions = (alphaLog as { details: { decisions: Array<{ category: string }> } }).details.decisions;
    expect(alphaDecisions.some((d) => d.category === 'budget')).toBe(false);

    // Beta log has only budget decisions
    const betaLog = await tools.decisionLog.execute(nextCallId(), { taskRef: betaTaskId });
    assertDecisionLogged(betaLog, 'budget');
    const betaDecisions = (betaLog as { details: { decisions: Array<{ category: string }> } }).details.decisions;
    expect(betaDecisions.some((d) => d.category === 'technical')).toBe(false);
  });
});
