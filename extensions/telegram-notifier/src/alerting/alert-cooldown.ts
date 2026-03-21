/**
 * Alert Cooldown -- In-memory deduplication for proactive alerts.
 *
 * Prevents the same alert from firing repeatedly within its cooldown window.
 * State is lost on restart (acceptable -- alerting is best-effort).
 *
 * Task 0108 (EP15)
 */

/** Cooldown entry tracking when an alert last fired. */
interface CooldownEntry {
  readonly firedAt: number;
}

export class AlertCooldown {
  private readonly entries = new Map<string, CooldownEntry>();

  /** Check if an alert is in cooldown. */
  isInCooldown(alertKey: string, cooldownMs: number, now: number = Date.now()): boolean {
    const entry = this.entries.get(alertKey);
    if (!entry) return false;
    return (now - entry.firedAt) < cooldownMs;
  }

  /** Record that an alert has fired. */
  recordFired(alertKey: string, now: number = Date.now()): void {
    this.entries.set(alertKey, { firedAt: now });
  }

  /** Clear all cooldown state. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of tracked alert keys. */
  get size(): number {
    return this.entries.size;
  }
}
