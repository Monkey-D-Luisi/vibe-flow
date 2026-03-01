/**
 * Mock GitHub API.
 * Records branch, PR, and label operations without making real API calls.
 */

export interface MockBranchOp {
  action: 'create';
  branch: string;
  base: string;
}

export interface MockPrOp {
  action: 'create' | 'update';
  title: string;
  branch?: string;
  prNumber?: number;
  body?: string;
}

export interface MockLabelOp {
  action: 'sync';
  labels: string[];
  prNumber?: number;
}

export class MockGitHubApi {
  readonly branches: MockBranchOp[] = [];
  readonly prs: MockPrOp[] = [];
  readonly labels: MockLabelOp[] = [];
  private _prCounter = 100;

  createBranch(branch: string, base = 'main'): { created: boolean; branch: string } {
    this.branches.push({ action: 'create', branch, base });
    return { created: true, branch };
  }

  createPr(title: string, branch: string, body = ''): { prNumber: number; url: string } {
    const prNumber = ++this._prCounter;
    this.prs.push({ action: 'create', title, branch, prNumber, body });
    return { prNumber, url: `https://github.com/owner/repo/pull/${prNumber}` };
  }

  updatePr(prNumber: number, body: string): { updated: boolean } {
    this.prs.push({ action: 'update', title: '', prNumber, body });
    return { updated: true };
  }

  syncLabels(prNumber: number, labels: string[]): { synced: boolean } {
    this.labels.push({ action: 'sync', labels, prNumber });
    return { synced: true };
  }

  reset(): void {
    this.branches.length = 0;
    this.prs.length = 0;
    this.labels.length = 0;
    this._prCounter = 100;
  }
}

export const mockGitHub = new MockGitHubApi();
