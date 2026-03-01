import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callStitchMcp } from '../src/stitch-client.js';
import type { StitchConfig } from '../src/stitch-client.js';

const baseConfig: StitchConfig = {
  endpoint: 'https://stitch.googleapis.com/mcp',
  defaultProjectId: 'proj-123',
  defaultModel: 'GEMINI_3_PRO',
  timeoutMs: 5000,
  designDir: '.stitch-html',
};

function makeOkResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ jsonrpc: '2.0', id: 'r1', result }),
    text: vi.fn().mockResolvedValue(''),
  };
}

function makeErrorResponse(status: number, body = 'Server Error') {
  return {
    ok: false,
    status,
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(body),
  };
}

function makeRpcErrorResponse(code: number, message: string) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 'r1',
      error: { code, message },
    }),
    text: vi.fn().mockResolvedValue(''),
  };
}

describe('callStitchMcp', () => {
  beforeEach(() => {
    process.env['STITCH_API_KEY'] = 'test-key-abc';
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete process.env['STITCH_API_KEY'];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves with result on successful response', async () => {
    const expected = { html: '<html/>', screenId: 'scr-1' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(expected)));

    const resultPromise = callStitchMcp(baseConfig, 'generate_screen_from_text', { prompt: 'Login page' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual(expected);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('sends correct headers and JSON-RPC body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = callStitchMcp(baseConfig, 'generate_screen_from_text', { projectId: 'p1' });
    await vi.runAllTimersAsync();
    await resultPromise;

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(baseConfig.endpoint);
    expect((opts.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key-abc');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body as string) as { jsonrpc: string; method: string };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('generate_screen_from_text');
  });

  it('throws when STITCH_API_KEY is not set', async () => {
    delete process.env['STITCH_API_KEY'];

    await expect(callStitchMcp(baseConfig, 'generate_screen_from_text', {})).rejects.toThrow(
      'STITCH_API_KEY environment variable is not set',
    );
  });

  it('throws on HTTP 4xx without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeErrorResponse(400, 'Bad Request'));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(callStitchMcp(baseConfig, 'generate_screen_from_text', {})).rejects.toThrow(
      'Stitch MCP returned 400',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws on RPC-level error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRpcErrorResponse(403, 'Permission denied')));

    const assertion = expect(callStitchMcp(baseConfig, 'generate_screen_from_text', {})).rejects.toThrow(
      'Stitch MCP error 403: Permission denied',
    );
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('retries on HTTP 5xx and succeeds on second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(makeOkResponse({ html: '<html/>' }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = callStitchMcp(baseConfig, 'generate_screen_from_text', {});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ html: '<html/>' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on network error and succeeds on third attempt', async () => {
    const networkError = new Error('fetch failed');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(makeOkResponse({ html: '<p/>' }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = callStitchMcp(baseConfig, 'generate_screen_from_text', {});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ html: '<p/>' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retry attempts on 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeErrorResponse(500, 'Internal Server Error'));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(callStitchMcp(baseConfig, 'generate_screen_from_text', {})).rejects.toThrow(
      'Stitch MCP returned 500',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
