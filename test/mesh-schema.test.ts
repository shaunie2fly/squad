/**
 * Tests for the mesh configuration schema (GeminiA2AConfig, MeshConfig)
 *
 * Covers:
 * - validateConfig accepts configs with valid mesh
 * - validateConfig accepts configs without mesh (backwards compat)
 * - validateConfig rejects invalid mesh shapes
 * - defineMesh builder validates and returns config
 * - defineSquad validates mesh via defineMesh
 */

import { describe, it, expect } from 'vitest';
import { validateConfig, defineConfig, DEFAULT_CONFIG } from '@bradygaster/squad-sdk/config';
import { defineMesh, defineSquad, defineTeam, defineAgent } from '@bradygaster/squad-sdk/builders';

// ---------------------------------------------------------------------------
// Base valid config for testing
// ---------------------------------------------------------------------------

const VALID_BASE = {
  version: '0.6.0',
  team: { name: 'Test Squad' },
  routing: { rules: [] },
  models: { default: 'claude-sonnet-4', defaultTier: 'standard', tiers: {} },
  agents: [],
};

const VALID_MESH_CONFIG = {
  geminiA2A: {
    enabled: true,
    endpoint: 'http://127.0.0.1:8080',
    agentName: 'gemini',
  },
};

// ---------------------------------------------------------------------------
// validateConfig — mesh field
// ---------------------------------------------------------------------------

describe('validateConfig — mesh field', () => {
  it('accepts config without mesh (backwards compat)', () => {
    expect(validateConfig(VALID_BASE)).toBe(true);
  });

  it('accepts config with valid mesh.geminiA2A', () => {
    expect(validateConfig({ ...VALID_BASE, mesh: VALID_MESH_CONFIG })).toBe(true);
  });

  it('accepts mesh.geminiA2A with optional model and authToken', () => {
    const config = {
      ...VALID_BASE,
      mesh: {
        geminiA2A: {
          ...VALID_MESH_CONFIG.geminiA2A,
          model: 'gemini-2.5-pro',
          authToken: 'tok',
        },
      },
    };
    expect(validateConfig(config)).toBe(true);
  });

  it('accepts mesh with no geminiA2A (empty mesh)', () => {
    expect(validateConfig({ ...VALID_BASE, mesh: {} })).toBe(true);
  });

  it('rejects mesh that is not an object', () => {
    expect(validateConfig({ ...VALID_BASE, mesh: 'invalid' })).toBe(false);
    expect(validateConfig({ ...VALID_BASE, mesh: 42 })).toBe(false);
    expect(validateConfig({ ...VALID_BASE, mesh: null })).toBe(false);
  });

  it('rejects mesh.geminiA2A with non-boolean enabled', () => {
    expect(
      validateConfig({
        ...VALID_BASE,
        mesh: { geminiA2A: { ...VALID_MESH_CONFIG.geminiA2A, enabled: 'yes' } },
      }),
    ).toBe(false);
  });

  it('rejects mesh.geminiA2A with missing endpoint', () => {
    const { endpoint: _, ...noEndpoint } = VALID_MESH_CONFIG.geminiA2A;
    expect(
      validateConfig({ ...VALID_BASE, mesh: { geminiA2A: noEndpoint } }),
    ).toBe(false);
  });

  it('rejects mesh.geminiA2A with non-string model', () => {
    expect(
      validateConfig({
        ...VALID_BASE,
        mesh: { geminiA2A: { ...VALID_MESH_CONFIG.geminiA2A, model: 123 } },
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defineMesh builder
// ---------------------------------------------------------------------------

describe('defineMesh', () => {
  it('returns the config object unchanged when valid', () => {
    const result = defineMesh(VALID_MESH_CONFIG);
    expect(result).toEqual(VALID_MESH_CONFIG);
  });

  it('accepts mesh with all optional fields', () => {
    const cfg = {
      geminiA2A: {
        enabled: true,
        endpoint: 'http://127.0.0.1:8080',
        agentName: 'gemini',
        model: 'gemini-2.5-pro',
        authToken: 'tok',
      },
    };
    expect(defineMesh(cfg)).toEqual(cfg);
  });

  it('accepts empty mesh {}', () => {
    expect(defineMesh({})).toEqual({});
  });

  it('throws BuilderValidationError when enabled is not boolean', () => {
    expect(() =>
      defineMesh({ geminiA2A: { enabled: 'yes' as any, endpoint: 'http://x', agentName: 'g' } }),
    ).toThrow('"geminiA2A.enabled" must be a boolean');
  });

  it('throws BuilderValidationError when endpoint is empty', () => {
    expect(() =>
      defineMesh({ geminiA2A: { enabled: true, endpoint: '', agentName: 'g' } }),
    ).toThrow('"geminiA2A.endpoint"');
  });

  it('throws BuilderValidationError when agentName is empty', () => {
    expect(() =>
      defineMesh({ geminiA2A: { enabled: true, endpoint: 'http://x', agentName: '' } }),
    ).toThrow('"geminiA2A.agentName"');
  });
});

// ---------------------------------------------------------------------------
// defineSquad — mesh pass-through
// ---------------------------------------------------------------------------

describe('defineSquad — mesh field', () => {
  const baseSquad = {
    team: defineTeam({ name: 'Core', members: ['@edie'] }),
    agents: [defineAgent({ name: 'edie', role: 'Engineer' })],
  };

  it('accepts defineSquad without mesh', () => {
    const result = defineSquad(baseSquad);
    expect(result.mesh).toBeUndefined();
  });

  it('accepts defineSquad with defineMesh', () => {
    const result = defineSquad({
      ...baseSquad,
      mesh: defineMesh(VALID_MESH_CONFIG),
    });
    expect(result.mesh).toEqual(VALID_MESH_CONFIG);
  });

  it('throws when mesh is invalid', () => {
    expect(() =>
      defineSquad({
        ...baseSquad,
        mesh: { geminiA2A: { enabled: 'nope' as any, endpoint: 'http://x', agentName: 'g' } },
      }),
    ).toThrow('"geminiA2A.enabled" must be a boolean');
  });
});

// ---------------------------------------------------------------------------
// defineConfig — mesh pass-through
// ---------------------------------------------------------------------------

describe('defineConfig — mesh pass-through', () => {
  it('DEFAULT_CONFIG does not include mesh (feature is opt-in)', () => {
    expect(DEFAULT_CONFIG.mesh).toBeUndefined();
  });

  it('defineConfig passes mesh through when provided', () => {
    const result = defineConfig({
      team: { name: 'T' },
      mesh: VALID_MESH_CONFIG,
    });
    expect(result.mesh).toEqual(VALID_MESH_CONFIG);
  });
});
