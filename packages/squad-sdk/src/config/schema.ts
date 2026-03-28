/**
 * Squad Configuration Schema
 * Typed configuration interface for Squad teams
 */

/**
 * Configuration for a Gemini CLI A2A (Agent2Agent) server connection.
 * Uses the A2A JSON-RPC 2.0 protocol over HTTP.
 *
 * Security: `authToken` must never be committed to source control.
 * Use an environment variable instead:
 *   authToken: process.env.SQUAD_GEMINI_AUTH_TOKEN
 */
export interface GeminiA2AConfig {
  /** Master toggle — must be explicitly set to `true` to enable A2A routing. */
  enabled: boolean;
  /** HTTP endpoint where gemini-cli is serving (default: `'http://127.0.0.1:8080'`). */
  endpoint: string;
  /** Agent name the coordinator matches against (default: `'gemini'`). */
  agentName: string;
  /**
   * Optional model hint sent in the JSON-RPC payload (e.g. `'gemini-2.5-pro'`).
   * When omitted the remote server uses its configured default.
   */
  model?: string;
  /**
   * Optional bearer token for the A2A server.
   * MUST NOT be committed to source — supply via environment variable.
   */
  authToken?: string;
  /**
   * Request timeout in milliseconds (default: `30_000`).
   * If the server accepts the connection but never responds the request is
   * aborted after this interval and the coordinator falls through to its
   * normal spawn strategy.
   */
  timeoutMs?: number;
}

/**
 * Mesh configuration — external agent connections and cross-machine coordination.
 * Corresponds to the "Distributed Mesh" architecture decision.
 */
export interface MeshConfig {
  /** Gemini CLI A2A server connection. */
  geminiA2A?: GeminiA2AConfig;
}

export interface SquadConfig {
  version: string;
  team: TeamConfig;
  routing: RoutingConfig;
  models: ModelConfig;
  agents: AgentConfig[];
  hooks?: HooksConfig;
  ceremonies?: CeremonyConfig[];
  plugins?: PluginConfig;
  /** External agent mesh connections (e.g. Gemini CLI via A2A). */
  mesh?: MeshConfig;
}

export interface TeamConfig {
  name: string;
  description?: string;
  projectContext?: string;
  issueSource?: {
    repo: string;
    filters?: string[];
  };
}

export interface AgentConfig {
  name: string;
  role: string;
  displayName?: string;
  charter?: string;
  model?: string;
  tools?: string[];
  status?: 'active' | 'inactive' | 'retired';
}

export interface RoutingConfig {
  rules: RoutingRule[];
  defaultAgent?: string;
  fallbackBehavior?: 'ask' | 'default-agent' | 'coordinator';
}

export interface RoutingRule {
  pattern: string;
  agents: string[];
  tier?: 'direct' | 'lightweight' | 'standard' | 'full';
  priority?: number;
}

export interface ModelConfig {
  default: string;
  defaultTier: 'premium' | 'standard' | 'fast';
  tiers: Record<string, string[]>;
  agentOverrides?: Record<string, string>;
  taskTypeMapping?: Record<string, string>;
}

export interface HooksConfig {
  allowedWritePaths?: string[];
  blockedCommands?: string[];
  maxAskUserPerSession?: number;
  scrubPii?: boolean;
  reviewerLockout?: boolean;
}

export interface CeremonyConfig {
  name: string;
  schedule?: string;
  participants?: string[];
  agenda?: string;
  enabled?: boolean;
}

export interface PluginConfig {
  enabled: string[];
  config?: Record<string, unknown>;
}

export const DEFAULT_CONFIG: SquadConfig = {
  version: '0.6.0',
  team: {
    name: 'Default Squad',
    description: 'A Squad team',
  },
  routing: {
    rules: [],
    fallbackBehavior: 'coordinator',
  },
  models: {
    default: 'claude-sonnet-4',
    defaultTier: 'standard',
    tiers: {
      premium: ['claude-opus-4', 'claude-opus-4.5'],
      standard: ['claude-sonnet-4', 'claude-sonnet-4.5', 'gpt-5.1-codex'],
      fast: ['claude-haiku-4.5', 'gpt-5.1-codex-mini'],
    },
  },
  agents: [],
};

export function defineConfig(config: Partial<SquadConfig>): SquadConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    team: {
      ...DEFAULT_CONFIG.team,
      ...config.team,
    },
    routing: {
      ...DEFAULT_CONFIG.routing,
      ...config.routing,
      rules: config.routing?.rules ?? DEFAULT_CONFIG.routing.rules,
    },
    models: {
      ...DEFAULT_CONFIG.models,
      ...config.models,
      tiers: config.models?.tiers ?? DEFAULT_CONFIG.models.tiers,
    },
    agents: config.agents ?? DEFAULT_CONFIG.agents,
  };
}

export function validateConfig(config: unknown): config is SquadConfig {
  if (typeof config !== 'object' || config === null) return false;
  
  const c = config as Partial<SquadConfig>;
  
  if (typeof c.version !== 'string') return false;
  if (!c.team || typeof c.team.name !== 'string') return false;
  if (!c.routing || !Array.isArray(c.routing.rules)) return false;
  if (!c.models || typeof c.models.default !== 'string') return false;
  if (!Array.isArray(c.agents)) return false;

  // Validate optional mesh config
  if (c.mesh !== undefined) {
    if (typeof c.mesh !== 'object' || c.mesh === null) return false;
    const { geminiA2A } = c.mesh;
    if (geminiA2A !== undefined) {
      if (typeof geminiA2A !== 'object' || geminiA2A === null) return false;
      if (typeof geminiA2A.enabled !== 'boolean') return false;
      if (typeof geminiA2A.endpoint !== 'string') return false;
      if (typeof geminiA2A.agentName !== 'string') return false;
      if (geminiA2A.model !== undefined && typeof geminiA2A.model !== 'string') return false;
      if (geminiA2A.authToken !== undefined && typeof geminiA2A.authToken !== 'string') return false;
      if (geminiA2A.timeoutMs !== undefined && typeof geminiA2A.timeoutMs !== 'number') return false;
    }
  }
  
  return true;
}
