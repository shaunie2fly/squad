/**
 * Tests for Gemini A2A routing through SquadCoordinator
 *
 * Covers:
 * - Routes to A2A client when enabled and agent name matches
 * - Falls back to normal spawn when A2A disabled (enabled: false)
 * - Falls back when no A2A client injected
 * - Falls back when agent name doesn't match routed agents
 * - Emits agent:a2a_dispatch event before dispatch
 * - Emits agent:a2a_response event after successful dispatch
 * - Emits session:error event on A2A failure, then falls through
 * - Returns uniform CoordinatorResult shape (strategy, routing, spawnResults)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SquadCoordinator, type SquadCoordinatorOptions, type CoordinatorResult } from '@bradygaster/squad-sdk/coordinator';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import { GeminiA2AClient, A2AError, type A2ATaskResult } from '@bradygaster/squad-sdk/remote/a2a';
import type { SquadConfig } from '@bradygaster/squad-sdk/runtime';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(geminiEnabled = true, agentName = 'gemini'): SquadConfig {
  return {
    version: '1.0.0',
    models: {
      defaultModel: 'claude-sonnet-4',
      defaultTier: 'standard',
      fallbackChains: { premium: [], standard: [], fast: [] },
      preferSameProvider: false,
      respectTierCeiling: false,
      nuclearFallback: { enabled: false, model: 'claude-haiku-4.5' },
    },
    routing: {
      rules: [
        {
          workType: 'gemini-query',
          agents: [agentName],
          examples: ['@gemini research this'],
          confidence: 'high',
        },
      ],
    },
    mesh: {
      geminiA2A: {
        enabled: geminiEnabled,
        endpoint: 'http://127.0.0.1:8080',
        agentName,
      },
    },
  } as unknown as SquadConfig;
}

function makeA2AClient(result: A2ATaskResult | Error): GeminiA2AClient {
  const client = Object.create(GeminiA2AClient.prototype) as GeminiA2AClient;
  client.sendTask = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return client;
}

function makeCoordinator(
  overrides: Partial<SquadCoordinatorOptions> = {},
): { coordinator: SquadCoordinator; bus: EventBus } {
  const bus = new EventBus();
  const coordinator = new SquadCoordinator({
    config: makeConfig(),
    eventBus: bus,
    ...overrides,
  });
  return { coordinator, bus };
}

const SESSION_CTX = { sessionId: 'test-session-1' };

// ---------------------------------------------------------------------------
// A2A dispatch — happy path
// ---------------------------------------------------------------------------

describe('SquadCoordinator A2A dispatch', () => {
  it('routes to A2A client when enabled and agent name matches', async () => {
    const a2aResult: A2ATaskResult = { status: 'completed', artifacts: [{ type: 'text', text: 'OK' }] };
    const client = makeA2AClient(a2aResult);
    const { coordinator } = makeCoordinator({ geminiA2AClient: client });

    const result: CoordinatorResult = await coordinator.handleMessage('@gemini research this', SESSION_CTX);

    expect(result.strategy).toBe('single');
    expect(result.spawnResults).toHaveLength(1);
    expect(result.spawnResults![0]!.agentName).toBe('gemini');
    expect(result.spawnResults![0]!.status).toBe('success');
    expect(client.sendTask).toHaveBeenCalledWith('@gemini research this');
  });

  // -------------------------------------------------------------------------

  it('returns uniform CoordinatorResult shape', async () => {
    const client = makeA2AClient({ status: 'completed' });
    const { coordinator } = makeCoordinator({ geminiA2AClient: client });

    const result = await coordinator.handleMessage('@gemini research this', SESSION_CTX);

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.routing).toBeDefined();
    expect(result.spawnResults).toBeDefined();
    expect(result.spawnResults![0]!.startTime).toBeInstanceOf(Date);
    expect(result.spawnResults![0]!.endTime).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------

  it('emits agent:a2a_dispatch event before HTTP call', async () => {
    const client = makeA2AClient({ status: 'completed' });
    const { coordinator, bus } = makeCoordinator({ geminiA2AClient: client });
    const dispatchEvents: unknown[] = [];
    bus.subscribe('agent:a2a_dispatch', (e) => dispatchEvents.push(e.payload));

    await coordinator.handleMessage('@gemini research this', SESSION_CTX);

    expect(dispatchEvents).toHaveLength(1);
    const payload = dispatchEvents[0] as Record<string, unknown>;
    expect(payload.agentName).toBe('gemini');
    expect(payload.endpoint).toBe('http://127.0.0.1:8080');
    expect(typeof payload.promptLength).toBe('number');
    // authToken must never appear
    expect(JSON.stringify(payload)).not.toContain('authToken');
    expect(JSON.stringify(payload)).not.toContain('Bearer');
  });

  // -------------------------------------------------------------------------

  it('emits agent:a2a_response event after successful dispatch', async () => {
    const client = makeA2AClient({ status: 'completed', artifacts: [{ type: 'text' }] });
    const { coordinator, bus } = makeCoordinator({ geminiA2AClient: client });
    const responseEvents: unknown[] = [];
    bus.subscribe('agent:a2a_response', (e) => responseEvents.push(e.payload));

    await coordinator.handleMessage('@gemini research this', SESSION_CTX);

    expect(responseEvents).toHaveLength(1);
    const payload = responseEvents[0] as Record<string, unknown>;
    expect(payload.agentName).toBe('gemini');
    expect(payload.status).toBe('completed');
    expect(typeof payload.durationMs).toBe('number');
    expect(payload.artifactCount).toBe(1);
  });

  // -------------------------------------------------------------------------

  it('emits session:error and falls through to fallback on A2A failure', async () => {
    const client = makeA2AClient(new A2AError('connection refused', undefined, 'http://127.0.0.1:8080'));
    const { coordinator, bus } = makeCoordinator({ geminiA2AClient: client });
    const errorEvents: unknown[] = [];
    bus.subscribe('session:error', (e) => errorEvents.push(e.payload));

    // Should not throw — falls through to normal strategy
    const result = await coordinator.handleMessage('@gemini research this', SESSION_CTX);

    expect(errorEvents).toHaveLength(1);
    const errPayload = errorEvents[0] as Record<string, unknown>;
    expect(errPayload.phase).toBe('a2a_dispatch');
    expect(errPayload.agentName).toBe('gemini');
    expect(typeof errPayload.error).toBe('string');

    // Result comes from fallback (no fan-out deps, so strategy is single/fallback)
    expect(['single', 'multi', 'fallback']).toContain(result.strategy);
  });

  // -------------------------------------------------------------------------

  it('falls back to normal strategy when A2A is disabled (enabled: false)', async () => {
    const client = makeA2AClient({ status: 'completed' });
    const disabledConfig = makeConfig(false);
    const bus = new EventBus();
    const coordinator = new SquadCoordinator({
      config: disabledConfig,
      eventBus: bus,
      geminiA2AClient: client,
    });

    await coordinator.handleMessage('@gemini research this', SESSION_CTX);

    // A2A client should NOT have been called
    expect(client.sendTask).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------

  it('falls back when no A2A client injected', async () => {
    const { coordinator } = makeCoordinator({ geminiA2AClient: undefined });
    // Should not throw
    const result = await coordinator.handleMessage('@gemini research this', SESSION_CTX);
    expect(result).toBeDefined();
  });

  // -------------------------------------------------------------------------

  it('falls back when agent name does not match routed agents', async () => {
    // mesh.agentName is 'gemini', but routing routes to 'other-agent'
    const config: SquadConfig = {
      ...makeConfig(true, 'gemini'),
      routing: {
        rules: [
          {
            workType: 'other-query',
            agents: ['other-agent'],
            examples: ['@other-agent do something'],
            confidence: 'high',
          },
        ],
      },
    } as unknown as SquadConfig;

    const client = makeA2AClient({ status: 'completed' });
    const bus = new EventBus();
    const coordinator = new SquadCoordinator({ config, eventBus: bus, geminiA2AClient: client });

    // Route message that matches 'other-agent' — not 'gemini'
    await coordinator.handleMessage('@other-agent do something', SESSION_CTX);

    // A2A client should NOT have been called (mesh.agentName 'gemini' ≠ routed 'other-agent')
    expect(client.sendTask).not.toHaveBeenCalled();
  });
});
