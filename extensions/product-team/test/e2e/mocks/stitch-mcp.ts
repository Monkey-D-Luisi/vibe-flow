/**
 * Mock Stitch MCP endpoint.
 * Captures design requests and returns canned HTML designs.
 */

export interface StitchDesignRequest {
  prompt: string;
  taskRef: string;
  agentId: string;
}

export interface StitchDesignResponse {
  designId: string;
  html: string;
  previewUrl: string;
}

const CANNED_HTML = `
<section class="dashboard">
  <h1>Dashboard</h1>
  <div class="metrics-grid">
    <div class="metric-card"><span>Active Users</span><strong>1,234</strong></div>
    <div class="metric-card"><span>Tasks Today</span><strong>56</strong></div>
  </div>
</section>
`.trim();

export class MockStitchMcp {
  readonly requests: StitchDesignRequest[] = [];

  design(request: StitchDesignRequest): StitchDesignResponse {
    this.requests.push(request);
    return {
      designId: `stitch-${this.requests.length}`,
      html: CANNED_HTML,
      previewUrl: `http://localhost:4000/preview/stitch-${this.requests.length}`,
    };
  }

  reset(): void {
    this.requests.length = 0;
  }
}

export const mockStitch = new MockStitchMcp();
