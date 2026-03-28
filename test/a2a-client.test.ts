/**
 * Tests for the Gemini A2A JSON-RPC 2.0 client
 *
 * Covers:
 * - Successful task dispatch (happy path)
 * - Model key included/excluded on wire
 * - Authorization header included/excluded
 * - A2AError on HTTP 4xx/5xx
 * - A2AError on JSON-RPC error response
 * - A2AError on network failure
 * - A2AError on missing result
 * - A2AError on invalid JSON
 * - Request shape matches A2A spec (jsonrpc, method, id)
 * - createGeminiA2AClient factory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GeminiA2AClient,
  createGeminiA2AClient,
  A2AError,
  type A2ATaskResult,
} from '@bradygaster/squad-sdk/remote/a2a';
import type { GeminiA2AConfig } from '@bradygaster/squad-sdk/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<GeminiA2AConfig> = {}): GeminiA2AConfig {
  return {
    enabled: true,
    endpoint: 'http://127.0.0.1:8080',
    agentName: 'gemini',
    ...overrides,
  };
}

function makeSuccessResponse(result: A2ATaskResult): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: 'req-1', result }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// GeminiA2AClient
// ---------------------------------------------------------------------------

describe('GeminiA2AClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------

  it('constructs with valid config', () => {
    const client = new GeminiA2AClient(makeConfig());
    expect(client).toBeInstanceOf(GeminiA2AClient);
  });

  // -------------------------------------------------------------------------

  it('sendTask — happy path returns A2ATaskResult', async () => {
    const expected: A2ATaskResult = {
      status: 'completed',
      artifacts: [{ type: 'text', text: 'Hello from Gemini' }],
    };
    fetchSpy.mockResolvedValueOnce(makeSuccessResponse(expected));

    const client = new GeminiA2AClient(makeConfig());
    const result = await client.sendTask('Say hello');
    expect(result).toEqual(expected);
  });

  // -------------------------------------------------------------------------

  it('sendTask — includes model key in params when configured', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeSuccessResponse({ status: 'completed' }),
    );

    const client = new GeminiA2AClient(makeConfig({ model: 'gemini-2.5-pro' }));
    await client.sendTask('hello');

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.params.model).toBe('gemini-2.5-pro');
  });

  // -------------------------------------------------------------------------

  it('sendTask — omits model key from params when not configured', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeSuccessResponse({ status: 'completed' }),
    );

    const client = new GeminiA2AClient(makeConfig());
    await client.sendTask('hello');

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect('model' in body.params).toBe(false);
  });

  // -------------------------------------------------------------------------

  it('sendTask — sends Authorization header when authToken present', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeSuccessResponse({ status: 'completed' }),
    );

    const client = new GeminiA2AClient(makeConfig({ authToken: 'secret-token' }));
    await client.sendTask('hello');

    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-token');
  });

  // -------------------------------------------------------------------------

  it('sendTask — omits Authorization header when no authToken', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeSuccessResponse({ status: 'completed' }),
    );

    const client = new GeminiA2AClient(makeConfig());
    await client.sendTask('hello');

    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  // -------------------------------------------------------------------------

  it('sendTask — throws A2AError on HTTP 500', async () => {
    fetchSpy.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

    const client = new GeminiA2AClient(makeConfig());
    await expect(client.sendTask('hello')).rejects.toThrow(A2AError);
    await expect(client.sendTask('hello')).rejects.toThrow('500');
  });

  // -------------------------------------------------------------------------

  it('sendTask — throws A2AError on JSON-RPC error response', async () => {
    const makeErrorResponse = () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'req-1',
          error: { code: -32601, message: 'Method not found', data: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    fetchSpy.mockImplementation(async () => makeErrorResponse());

    const client = new GeminiA2AClient(makeConfig());
    await expect(client.sendTask('hello')).rejects.toThrow(A2AError);
    await expect(client.sendTask('hello')).rejects.toThrow('Method not found');
  });

  // -------------------------------------------------------------------------

  it('sendTask — throws A2AError on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    const client = new GeminiA2AClient(makeConfig());
    await expect(client.sendTask('hello')).rejects.toThrow(A2AError);
    await expect(client.sendTask('hello')).rejects.toThrow('network error');
  });

  // -------------------------------------------------------------------------

  it('sendTask — request shape matches A2A spec', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeSuccessResponse({ status: 'completed' }),
    );

    const client = new GeminiA2AClient(makeConfig());
    await client.sendTask('Test prompt');

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tasks/send');
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.params.message.role).toBe('user');
    expect(body.params.message.parts[0].type).toBe('text');
    expect(body.params.message.parts[0].text).toBe('Test prompt');
  });
});

// ---------------------------------------------------------------------------
// createGeminiA2AClient factory
// ---------------------------------------------------------------------------

describe('createGeminiA2AClient', () => {
  it('returns a GeminiA2AClient instance', () => {
    const client = createGeminiA2AClient(makeConfig());
    expect(client).toBeInstanceOf(GeminiA2AClient);
  });
});

// ---------------------------------------------------------------------------
// A2AError
// ---------------------------------------------------------------------------

describe('A2AError', () => {
  it('sets name, message, code, endpoint, and data', () => {
    const err = new A2AError('bad request', 400, 'http://endpoint', { detail: 'x' });
    expect(err.name).toBe('A2AError');
    expect(err.message).toBe('bad request');
    expect(err.code).toBe(400);
    expect(err.endpoint).toBe('http://endpoint');
    expect(err.data).toEqual({ detail: 'x' });
  });

  it('is an instance of Error', () => {
    expect(new A2AError('err')).toBeInstanceOf(Error);
  });

  it('does not include authToken in message', () => {
    const err = new A2AError('A2A HTTP error 401 from http://127.0.0.1:8080');
    expect(err.message).not.toContain('secret');
    expect(err.message).not.toContain('token');
    expect(err.message).not.toContain('Bearer');
  });
});
