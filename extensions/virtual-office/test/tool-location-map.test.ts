import { describe, it, expect } from 'vitest';
import { getToolLocation } from '../src/shared/tool-location-map.js';

describe('tool-location-map', () => {
  const HOME_COL = 3;
  const HOME_ROW = 6;

  it('returns own desk for null tool', () => {
    const loc = getToolLocation(null, HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  // team_* tools now stay at own desk (messaging from desk, like Slack)
  it('maps team_message to own desk', () => {
    const loc = getToolLocation('team_message', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  it('maps team_reply to own desk', () => {
    const loc = getToolLocation('team_reply', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  it('maps team_assign to own desk', () => {
    const loc = getToolLocation('team_assign', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  // Decision tools go to meeting room (real meetings)
  it('maps decision_evaluate to meeting room', () => {
    const loc = getToolLocation('decision_evaluate', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: 9, row: 4 });
  });

  it('maps decision_log to meeting room', () => {
    const loc = getToolLocation('decision_log', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: 9, row: 4 });
  });

  // Deploy tools go to server rack
  it('maps vcs_pr_create to server rack', () => {
    const loc = getToolLocation('vcs_pr_create', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: 16, row: 8 });
  });

  it('maps vcs_pr_update to server rack', () => {
    const loc = getToolLocation('vcs_pr_update', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: 16, row: 8 });
  });

  it('maps pipeline_advance to server rack', () => {
    const loc = getToolLocation('pipeline_advance', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: 16, row: 8 });
  });

  // Desk-bound tools
  it('returns own desk for quality tools', () => {
    const loc = getToolLocation('quality_tests', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  it('returns own desk for task tools', () => {
    const loc = getToolLocation('task_create', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  it('returns own desk for team_inbox (reading at desk)', () => {
    const loc = getToolLocation('team_inbox', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });

  it('returns own desk for unknown tools', () => {
    const loc = getToolLocation('some_unknown_tool', HOME_COL, HOME_ROW);
    expect(loc).toEqual({ col: HOME_COL, row: HOME_ROW });
  });
});
