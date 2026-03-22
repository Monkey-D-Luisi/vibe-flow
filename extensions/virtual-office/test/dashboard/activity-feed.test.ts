import { describe, it, expect } from 'vitest';
import { ActivityFeed } from '../../src/public/dashboard/activity-feed.js';

describe('ActivityFeed', () => {
  it('starts empty', () => {
    const feed = new ActivityFeed();
    expect(feed.size).toBe(0);
  });

  it('adds entries', () => {
    const feed = new ActivityFeed();
    feed.push({ agentId: 'pm', action: 'task_create', timestamp: 1000 });
    expect(feed.size).toBe(1);
  });

  it('renders entries with agent and action', () => {
    const feed = new ActivityFeed();
    feed.push({ agentId: 'pm', action: 'task_create', timestamp: 1000, taskId: 'TASK-123456' });
    const html = feed.render();
    expect(html).toContain('pm');
    expect(html).toContain('task_create');
    expect(html).toContain('#123456');
  });

  it('renders empty message when no entries', () => {
    const feed = new ActivityFeed();
    const html = feed.render();
    expect(html).toContain('No activity yet');
  });

  it('limits to 20 entries', () => {
    const feed = new ActivityFeed();
    for (let i = 0; i < 25; i++) {
      feed.push({ agentId: `agent-${i}`, action: 'test', timestamp: i * 1000 });
    }
    expect(feed.size).toBe(20);
  });

  it('newest entries appear first', () => {
    const feed = new ActivityFeed();
    feed.push({ agentId: 'first', action: 'a', timestamp: 1000 });
    feed.push({ agentId: 'second', action: 'b', timestamp: 2000 });
    const html = feed.render();
    const firstIdx = html.indexOf('second');
    const secondIdx = html.indexOf('first');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('clears all entries', () => {
    const feed = new ActivityFeed();
    feed.push({ agentId: 'pm', action: 'test', timestamp: 1000 });
    feed.push({ agentId: 'qa', action: 'test', timestamp: 2000 });
    expect(feed.size).toBe(2);
    feed.clear();
    expect(feed.size).toBe(0);
  });

  it('escapes HTML in agent and action', () => {
    const feed = new ActivityFeed();
    feed.push({ agentId: '<script>', action: '&alert', timestamp: 1000 });
    const html = feed.render();
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;alert');
    expect(html).not.toContain('<script>');
  });
});
