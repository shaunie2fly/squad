/**
 * Squad Remote Control — SDK exports
 */

export { RemoteBridge } from './bridge.js';
export {
  RC_PROTOCOL_VERSION,
  serializeEvent,
  parseCommand,
  type RCMessage,
  type RCAgent,
  type RCServerEvent,
  type RCClientCommand,
  type RCStatusEvent,
  type RCHistoryEvent,
  type RCDeltaEvent,
  type RCCompleteEvent,
  type RCAgentsEvent,
  type RCToolCallEvent,
  type RCPermissionEvent,
  type RCUsageEvent,
  type RCErrorEvent,
  type RCPongEvent,
  type RCPromptCommand,
  type RCDirectCommand,
  type RCSlashCommand,
  type RCPermissionResponse,
  type RCPingCommand,
  type RCToolCallSummary,
} from './protocol.js';
export type {
  RemoteBridgeConfig,
  RemoteConnection,
  ConnectionState,
} from './types.js';

// A2A (Agent2Agent) client
export {
  GeminiA2AClient,
  createGeminiA2AClient,
  A2AError,
  type A2ARequest,
  type A2AResponse,
  type A2ATaskParams,
  type A2ATaskResult,
} from './a2a-client.js';

