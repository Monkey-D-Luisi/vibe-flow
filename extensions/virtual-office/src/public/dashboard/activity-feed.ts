/**
 * Activity Feed -- Rolling log of recent SSE events.
 *
 * Maintains a fixed-size buffer of activity entries and provides
 * a render method to build the feed HTML.
 *
 * Task 0139 (EP15)
 */

export interface ActivityEntry {
  readonly agentId: string;
  readonly action: string;
  readonly timestamp: number;
}

const MAX_ENTRIES = 20;

export class ActivityFeed {
  private readonly entries: ActivityEntry[] = [];

  push(entry: ActivityEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }

  render(): string {
    if (this.entries.length === 0) {
      return '<div class="feed-empty">No activity yet</div>';
    }
    return this.entries
      .map(e => {
        const time = formatTime(e.timestamp);
        return `<div class="feed-entry"><span class="feed-time">${time}</span> <span class="feed-agent">${escapeHtml(e.agentId)}</span> ${escapeHtml(e.action)}</div>`;
      })
      .join('');
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
