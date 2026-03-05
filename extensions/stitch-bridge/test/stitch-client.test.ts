import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callStitchMcp, sendRpc, initializeSession, listTools, resetSessionCache } from '../src/stitch-client.js';
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

/** Helper: wrap a value in MCP tools/call content format. */
function mcpContent(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

describe('sendRpc', () => {
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
    const expected = { html: '<html/>' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse(expected)));

    const resultPromise = sendRpc(baseConfig, 'tools/call', { name: 'test' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual(expected);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('sends correct headers and JSON-RPC body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = sendRpc(baseConfig, 'tools/call', { name: 'gen', arguments: { p: 1 } });
    await vi.runAllTimersAsync();
    await resultPromise;

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(baseConfig.endpoint);
    expect((opts.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key-abc');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body as string) as { jsonrpc: string; method: string; params: Record<string, unknown> };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
    expect(body.params).toEqual({ name: 'gen', arguments: { p: 1 } });
  });

  it('throws when STITCH_API_KEY is not set', async () => {
    delete process.env['STITCH_API_KEY'];
    await expect(sendRpc(baseConfig, 'tools/call', {})).rejects.toThrow(
      'STITCH_API_KEY environment variable is not set',
    );
  });

  it('throws on HTTP 4xx without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeErrorResponse(400, 'Bad Request'));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(sendRpc(baseConfig, 'tools/call', {})).rejects.toThrow(
      'Stitch MCP returned 400',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws on RPC-level error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeRpcErrorResponse(403, 'Permission denied')));

    const assertion = expect(sendRpc(baseConfig, 'tools/call', {})).rejects.toThrow(
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

    const resultPromise = sendRpc(baseConfig, 'tools/call', {});
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

    const resultPromise = sendRpc(baseConfig, 'tools/call', {});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ html: '<p/>' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retry attempts on 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeErrorResponse(500, 'Internal Server Error'));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(sendRpc(baseConfig, 'tools/call', {})).rejects.toThrow(
      'Stitch MCP returned 500',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('initializeSession', () => {
  beforeEach(() => {
    process.env['STITCH_API_KEY'] = 'test-key-abc';
    resetSessionCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete process.env['STITCH_API_KEY'];
    resetSessionCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends initialize on first call and caches for subsequent calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({ protocolVersion: '2025-03-26' }));
    vi.stubGlobal('fetch', fetchMock);

    const p1 = initializeSession(baseConfig);
    await vi.runAllTimersAsync();
    await p1;

    expect(fetchMock).toHaveBeenCalledOnce();
    const body1 = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as { method: string };
    expect(body1.method).toBe('initialize');

    // Second call should NOT send another request
    const p2 = initializeSession(baseConfig);
    await vi.runAllTimersAsync();
    await p2;

    expect(fetchMock).toHaveBeenCalledOnce(); // still 1
  });
});

describe('callStitchMcp (MCP protocol)', () => {
  beforeEach(() => {
    process.env['STITCH_API_KEY'] = 'test-key-abc';
    resetSessionCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete process.env['STITCH_API_KEY'];
    resetSessionCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends initialize then tools/call with proper params', async () => {
    const initResponse = makeOkResponse({ protocolVersion: '2025-03-26' });
    const toolResponse = makeOkResponse(mcpContent({ html: '<div/>', screenId: 's1' }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(initResponse)
      .mockResolvedValueOnce(toolResponse);
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = callStitchMcp(baseConfig, 'generate_screen_from_text', { prompt: 'Login' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First call is initialize
    const body1 = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as { method: string };
    expect(body1.method).toBe('initialize');

    // Second call is tools/call
    const body2 = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string) as {
      method: string;
      params: { name: string; arguments: Record<string, unknown> };
    };
    expect(body2.method).toBe('tools/call');
    expect(body2.params.name).toBe('generate_screen_from_text');
    expect(body2.params.arguments).toEqual({ prompt: 'Login' });

    // Result is the parsed JSON from the content block
    expect(result).toEqual({ html: '<div/>', screenId: 's1' });
  });

  it('throws on tool error response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeOkResponse({ protocolVersion: '2025-03-26' }))
      .mockResolvedValueOnce(makeOkResponse({ isError: true, content: [{ type: 'text', text: 'Invalid project' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(callStitchMcp(baseConfig, 'generate_screen_from_text', {})).rejects.toThrow(
      'Stitch tool "generate_screen_from_text" failed: Invalid project',
    );
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('throws on empty content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeOkResponse({ protocolVersion: '2025-03-26' }))
      .mockResolvedValueOnce(makeOkResponse({ content: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const assertion = expect(callStitchMcp(baseConfig, 'generate_screen_from_text', {})).rejects.toThrow(
      'empty content',
    );
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('returns raw text wrapped in object when content is not JSON', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeOkResponse({ protocolVersion: '2025-03-26' }))
      .mockResolvedValueOnce(makeOkResponse({ content: [{ type: 'text', text: 'plain text result' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = callStitchMcp(baseConfig, 'test_tool', {});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ text: 'plain text result' });
  });
});

describe('listTools', () => {
  beforeEach(() => {
    process.env['STITCH_API_KEY'] = 'test-key-abc';
    resetSessionCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    delete process.env['STITCH_API_KEY'];
    resetSessionCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends initialize then tools/list', async () => {
    const toolsList = { tools: [{ name: 'generate_screen_from_text' }, { name: 'edit_screens' }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeOkResponse({ protocolVersion: '2025-03-26' }))
      .mockResolvedValueOnce(makeOkResponse(toolsList));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = listTools(baseConfig);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual(toolsList);

    const body2 = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string) as { method: string };
    expect(body2.method).toBe('tools/list');
  });
});
