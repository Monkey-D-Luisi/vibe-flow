import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the Virtual Office frontend.
 *
 * Requires the server to be running at localhost:28789.
 * Run: docker compose up -d && npx playwright test
 */

test.describe('Virtual Office Smoke', () => {
  test('renders canvas and agents', async ({ page }) => {
    await page.goto('/office');
    await page.waitForSelector('#office-canvas');

    const canvas = page.locator('#office-canvas');
    await expect(canvas).toBeVisible();

    const agentCount = await page.evaluate(() => {
      const agents = (window as Record<string, unknown>).__officeAgents as Array<{ id: string }>;
      return agents?.length ?? 0;
    });
    expect(agentCount).toBe(8);
  });

  test('agents at desk initially, some walk to coffee, then return', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/office');
    await page.waitForSelector('#office-canvas');

    // t=0s: all agents should be at or very near their desks
    const initialPositions = await page.evaluate(() => {
      const agents = (window as Record<string, unknown>).__officeAgents as Array<{
        id: string; x: number; y: number; homeX: number; homeY: number;
      }>;
      return agents?.map(a => ({
        id: a.id,
        atHome: Math.abs(a.x - a.homeX) < 0.5 && Math.abs(a.y - a.homeY) < 0.5,
      })) ?? [];
    });

    expect(initialPositions.length).toBe(8);
    const allAtHome = initialPositions.every(a => a.atHome);
    expect(allAtHome).toBe(true);

    // Wait for patrol cooldowns (12-25s initial + stagger)
    await page.waitForTimeout(20_000);

    // t=20s: at least 1 agent should have moved away from desk (on coffee run)
    const movedCount = await page.evaluate(() => {
      const agents = (window as Record<string, unknown>).__officeAgents as Array<{
        id: string; x: number; y: number; homeX: number; homeY: number;
      }>;
      if (!agents) return 0;
      return agents.filter(a =>
        Math.abs(a.x - a.homeX) > 0.5 || Math.abs(a.y - a.homeY) > 0.5
      ).length;
    });
    expect(movedCount).toBeGreaterThanOrEqual(1);

    // Wait for return journey (coffee pause 3-5s + walk back)
    await page.waitForTimeout(25_000);

    // t=45s: agents that went to coffee should be back at desk
    const finalPositions = await page.evaluate(() => {
      const agents = (window as Record<string, unknown>).__officeAgents as Array<{
        id: string; x: number; y: number; homeX: number; homeY: number;
      }>;
      return agents?.map(a => ({
        id: a.id,
        atHome: Math.abs(a.x - a.homeX) < 0.5 && Math.abs(a.y - a.homeY) < 0.5,
      })) ?? [];
    });

    // Most agents should be back home (allow 1-2 still in transit)
    const homeCount = finalPositions.filter(a => a.atHome).length;
    expect(homeCount).toBeGreaterThanOrEqual(6);
  });

  test('no agent overlap at coffee spots', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/office');
    await page.waitForSelector('#office-canvas');

    // Wait for some agents to head to coffee
    await page.waitForTimeout(20_000);

    // Check that no two agents are at the same tile
    const positions = await page.evaluate(() => {
      const agents = (window as Record<string, unknown>).__officeAgents as Array<{
        id: string; x: number; y: number;
      }>;
      if (!agents) return [];
      return agents.map(a => ({
        id: a.id,
        col: Math.round(a.x),
        row: Math.round(a.y),
      }));
    });

    // Check for overlap: no two agents at the same coffee tile
    const seen = new Set<string>();
    for (const p of positions) {
      const key = `${p.col},${p.row}`;
      const isCoffeeTile = p.col >= 14 && p.col <= 17 && p.row >= 3 && p.row <= 4;
      if (isCoffeeTile && seen.has(key)) {
        const other = positions.find(q => q.id !== p.id && q.col === p.col && q.row === p.row);
        if (other) {
          throw new Error(`Overlap at coffee tile (${p.col},${p.row}) between ${p.id} and ${other.id}`);
        }
      }
      seen.add(key);
    }
  });

  test('agents array is accessible for debugging', async ({ page }) => {
    await page.goto('/office');
    await page.waitForSelector('#office-canvas');

    const hasDebugGlobals = await page.evaluate(() => {
      const agents = (window as Record<string, unknown>).__officeAgents;
      const camera = (window as Record<string, unknown>).__officeCamera;
      return Boolean(agents && camera);
    });

    expect(hasDebugGlobals).toBe(true);
  });
});
