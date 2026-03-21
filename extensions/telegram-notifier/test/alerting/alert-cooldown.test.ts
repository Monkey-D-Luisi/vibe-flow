import { describe, it, expect } from 'vitest';
import { AlertCooldown } from '../../src/alerting/alert-cooldown.js';

describe('AlertCooldown', () => {
  it('returns false for untracked alert key', () => {
    const cooldown = new AlertCooldown();
    expect(cooldown.isInCooldown('budget_warning', 60_000)).toBe(false);
  });

  it('returns true when alert is within cooldown window', () => {
    const cooldown = new AlertCooldown();
    const now = Date.now();
    cooldown.recordFired('budget_warning', now);
    expect(cooldown.isInCooldown('budget_warning', 60_000, now + 30_000)).toBe(true);
  });

  it('returns false when cooldown has expired', () => {
    const cooldown = new AlertCooldown();
    const now = Date.now();
    cooldown.recordFired('budget_warning', now);
    expect(cooldown.isInCooldown('budget_warning', 60_000, now + 61_000)).toBe(false);
  });

  it('tracks different alert keys independently', () => {
    const cooldown = new AlertCooldown();
    const now = Date.now();
    cooldown.recordFired('budget_warning', now);
    expect(cooldown.isInCooldown('budget_warning', 60_000, now + 10_000)).toBe(true);
    expect(cooldown.isInCooldown('pipeline_stalled', 60_000, now + 10_000)).toBe(false);
  });

  it('clears all entries', () => {
    const cooldown = new AlertCooldown();
    cooldown.recordFired('a');
    cooldown.recordFired('b');
    expect(cooldown.size).toBe(2);
    cooldown.clear();
    expect(cooldown.size).toBe(0);
  });

  it('overwrites previous fire time on re-record', () => {
    const cooldown = new AlertCooldown();
    const t1 = 1000;
    const t2 = 2000;
    cooldown.recordFired('key', t1);
    cooldown.recordFired('key', t2);
    // Cooldown window of 1500ms -- from t2, so t2 + 1000 = 3000 should be in cooldown
    expect(cooldown.isInCooldown('key', 1500, 3000)).toBe(true);
    // t2 + 2000 = 4000 should be out of cooldown
    expect(cooldown.isInCooldown('key', 1500, 4000)).toBe(false);
  });
});
