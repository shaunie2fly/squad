/**
 * Gemini CLI A2A (Agent2Agent) JSON-RPC 2.0 Client
 *
 * Treats a running `gemini-cli` server as an autonomous peer reachable over
 * HTTP. Requests are sent as JSON-RPC 2.0 `tasks/send` calls; responses are
 * mapped to the A2A task result schema.
 *
 * Design decisions:
 * - Uses `globalThis.fetch` (Node ≥22.5.0) — no new npm dependencies.
 * - Uses `crypto.randomUUID()` for request IDs — built-in.
 * - `authToken` is **never** included in logs, error messages, or event payloads.
 * - The `model` JSON-RPC key is conditionally absent from the wire payload when
 *   not configured (conditional spread, not `undefined`).
 * - No retry logic in v1 — the coordinator fallback mechanism handles failures.
 *
 * @module remote/a2a-client
 */

import type { GeminiA2AConfig } from '../config/schema.js';

// ============================================================================
// A2A JSON-RPC 2.0 Wire Types
// ============================================================================

/**
 * A2A JSON-RPC 2.0 request envelope.
 */
export interface A2ARequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: string;
}

/**
 * A2A JSON-RPC 2.0 response envelope.
 */
export interface A2AResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string; data?: unknown };
  id: string;
}

/**
 * Parameters for the `tasks/send` JSON-RPC method.
 */
export interface A2ATaskParams {
  message: {
    role: 'user';
    parts: Array<{ type: 'text'; text: string }>;
  };
  /** Model hint — only included on the wire when explicitly configured. */
  model?: string;
}

/**
 * Result shape returned by the A2A server for a completed task.
 */
export interface A2ATaskResult {
  /** Task completion status. */
  status: 'completed' | 'failed' | 'in_progress';
  /** Output artifacts (if any). */
  artifacts?: Array<{ type: string; text?: string }>;
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Typed error thrown by `GeminiA2AClient` for all failure modes:
 * - Non-2xx HTTP responses
 * - JSON-RPC error responses
 * - Network failures
 *
 * `authToken` is **never** included in the message, code, endpoint, or data.
 */
export class A2AError extends Error {
  /** JSON-RPC error code (when available). */
  readonly code?: number;
  /** Endpoint that was called (auth token stripped). */
  readonly endpoint?: string;
  /** Additional error data from the JSON-RPC response (when available). */
  readonly data?: unknown;

  constructor(message: string, code?: number, endpoint?: string, data?: unknown) {
    super(message);
    this.name = 'A2AError';
    this.code = code;
    this.endpoint = endpoint;
    this.data = data;
  }
}

// ============================================================================
// A2A Client
// ============================================================================

/**
 * HTTP client for the Gemini CLI A2A (Agent2Agent) JSON-RPC 2.0 protocol.
 *
 * Construct via `createGeminiA2AClient(config)` or `new GeminiA2AClient(config)`.
 *
 * ```typescript
 * const client = createGeminiA2AClient({
 *   enabled: true,
 *   endpoint: 'http://127.0.0.1:8080',
 *   agentName: 'gemini',
 *   model: 'gemini-2.5-pro',
 *   // authToken: process.env.SQUAD_GEMINI_AUTH_TOKEN
 * });
 *
 * const result = await client.sendTask('Explain the A2A protocol');
 * console.log(result.status, result.artifacts);
 * ```
 */
export class GeminiA2AClient {
  private readonly config: GeminiA2AConfig;

  constructor(config: GeminiA2AConfig) {
    this.config = config;
  }

  /**
   * Send a user prompt to the Gemini A2A server and return the task result.
   *
   * Sends a JSON-RPC 2.0 `tasks/send` request and maps the response to
   * `A2ATaskResult`. Throws `A2AError` on any failure (HTTP, JSON-RPC,
   * or network).
   *
   * @param prompt - User message text to send to the remote agent.
   * @returns Resolved task result from the remote agent.
   * @throws {A2AError} On HTTP errors, JSON-RPC errors, or network failures.
   */
  async sendTask(prompt: string): Promise<A2ATaskResult> {
    const { endpoint, model, authToken } = this.config;

    // Build JSON-RPC params — model key is absent when not configured
    const params: A2ATaskParams = {
      message: {
        role: 'user',
        parts: [{ type: 'text', text: prompt }],
      },
      ...(model !== undefined ? { model } : {}),
    };

    const requestBody: A2ARequest = {
      jsonrpc: '2.0',
      method: 'tasks/send',
      params: params as unknown as Record<string, unknown>,
      id: crypto.randomUUID(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let response: Response;
    try {
      response = await globalThis.fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      // Network-level failure — never expose authToken in message
      throw new A2AError(
        `A2A network error connecting to ${endpoint}: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
        undefined,
        endpoint,
      );
    }

    if (!response.ok) {
      throw new A2AError(
        `A2A HTTP error ${response.status} from ${endpoint}`,
        response.status,
        endpoint,
      );
    }

    let json: A2AResponse<A2ATaskResult>;
    try {
      json = await response.json() as A2AResponse<A2ATaskResult>;
    } catch {
      throw new A2AError(
        `A2A invalid JSON response from ${endpoint}`,
        undefined,
        endpoint,
      );
    }

    if (json.error) {
      throw new A2AError(
        `A2A JSON-RPC error from ${endpoint}: ${json.error.message}`,
        json.error.code,
        endpoint,
        json.error.data,
      );
    }

    if (!json.result) {
      throw new A2AError(
        `A2A response missing result from ${endpoint}`,
        undefined,
        endpoint,
      );
    }

    return json.result;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a `GeminiA2AClient` from a `GeminiA2AConfig`.
 *
 * Convenience factory that mirrors the pattern of other SDK builder functions.
 *
 * @param config - Gemini A2A connection configuration.
 * @returns Configured `GeminiA2AClient` instance.
 */
export function createGeminiA2AClient(config: GeminiA2AConfig): GeminiA2AClient {
  return new GeminiA2AClient(config);
}
