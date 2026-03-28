# Gemini CLI A2A Integration

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to research something using Gemini:**
```
@gemini research the latest developments in the A2A protocol
```

**Try this to verify the integration is running:**
```
@gemini ping
```

Integrate a running `gemini-cli` server into Squad as a first-class agent peer using the [Agent2Agent (A2A) JSON-RPC 2.0 protocol](https://github.com/google-gemini/gemini-api-examples). Rather than spawning Gemini as a subprocess, the coordinator reaches the `gemini-cli` server over HTTP and routes tasks to it the same way it routes to local agents.

---

## How It Works

The coordinator's `handleMessage()` pipeline includes an **A2A dispatch check** after route analysis. When:

1. `mesh.geminiA2A.enabled` is `true`
2. The message is routed to the configured `agentName` (e.g. `@gemini`)
3. A `GeminiA2AClient` is injected into the coordinator

...the coordinator sends a `tasks/send` JSON-RPC 2.0 request to the configured endpoint and returns the result as a standard `CoordinatorResult`. All downstream consumers (UI, telemetry, Ralph) see the same shape as a locally spawned agent.

If the A2A call fails, the coordinator emits a `session:error` event and **falls through** to its normal spawn strategy — A2A failure is never fatal.

---

## Setup

### 1. Start the Gemini CLI server

Follow the [gemini-cli documentation](https://github.com/google-gemini/gemini-cli) to start a server:

```bash
gemini serve --port 8080
```

### 2. Configure Squad

In your `squad.config.ts`:

```typescript
import { defineSquad, defineMesh } from '@bradygaster/squad-sdk/builders';

export default defineSquad({
  version: '1.0.0',
  team: { name: 'Core', members: ['@edie', '@gemini'] },
  agents: [
    // ... your local agents ...
  ],
  mesh: defineMesh({
    geminiA2A: {
      enabled: true,
      endpoint: 'http://127.0.0.1:8080',
      agentName: 'gemini',
      model: 'gemini-2.5-pro',        // optional
      // authToken: process.env.SQUAD_GEMINI_AUTH_TOKEN  // see Security below
    },
  }),
});
```

### 3. Inject the client into the coordinator

```typescript
import { SquadCoordinator } from '@bradygaster/squad-sdk/coordinator';
import { createGeminiA2AClient } from '@bradygaster/squad-sdk/remote/a2a';

const coordinator = new SquadCoordinator({
  config,
  eventBus,
  geminiA2AClient: createGeminiA2AClient(config.mesh!.geminiA2A!),
});
```

---

## Configuration Reference

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | `boolean` | ✅ | — | Master toggle. Must be `true` to enable routing. |
| `endpoint` | `string` | ✅ | — | HTTP endpoint of the gemini-cli server. |
| `agentName` | `string` | ✅ | — | Agent name in routing rules (e.g. `'gemini'`). |
| `model` | `string` | ❌ | server default | Model hint sent to the remote server. |
| `authToken` | `string` | ❌ | none | Bearer token. **Never commit — use env var.** |

---

## Event Bus Integration

The A2A integration emits dedicated events you can subscribe to:

| Event | When | Payload |
|---|---|---|
| `agent:a2a_dispatch` | Before the HTTP call | `{ agentName, endpoint, promptLength, model? }` |
| `agent:a2a_response` | After a successful call | `{ agentName, status, durationMs, artifactCount? }` |
| `session:error` | When the A2A call fails | `{ phase: 'a2a_dispatch', agentName, error, durationMs }` |

```typescript
bus.subscribe('agent:a2a_dispatch', (event) => {
  console.log(`Dispatching to ${event.payload.agentName} at ${event.payload.endpoint}`);
});

bus.subscribe('agent:a2a_response', (event) => {
  console.log(`Response: ${event.payload.status} in ${event.payload.durationMs}ms`);
});
```

---

## Security

### Auth Token

The `authToken` field is optional. When provided:
- It is sent as `Authorization: Bearer <token>` on every request.
- It is **never** included in event payloads, logs, or error messages.
- It must **never** be committed to source control.

Use an environment variable:

```typescript
// squad.config.ts
mesh: defineMesh({
  geminiA2A: {
    enabled: true,
    endpoint: 'http://127.0.0.1:8080',
    agentName: 'gemini',
    authToken: process.env.SQUAD_GEMINI_AUTH_TOKEN,
  },
}),
```

### Network Isolation

- In production, bind the gemini-cli server to `127.0.0.1` to prevent external access.
- Use a reverse proxy (nginx, Caddy) with TLS if the server must be reachable over a network.

---

## Troubleshooting

### `A2A network error connecting to ...`

The gemini-cli server is not running or the endpoint is wrong. Start the server and verify the endpoint in your config.

### `A2A HTTP error 401`

The server requires an auth token. Set `authToken: process.env.SQUAD_GEMINI_AUTH_TOKEN` and export the variable.

### `A2A JSON-RPC error: Method not found`

The server does not support the `tasks/send` method. Upgrade your gemini-cli to a version that supports the A2A protocol.

### A2A call succeeds but routing falls through to local agents

- Check that `mesh.geminiA2A.enabled` is `true`.
- Check that `agentName` matches the agent name in your routing rules (without `@`).
- Check that `geminiA2AClient` is injected into `SquadCoordinator`.

---

## SDK API Reference

```typescript
// Types
import type {
  GeminiA2AConfig,
  MeshConfig,
} from '@bradygaster/squad-sdk/config';

import type {
  A2ARequest,
  A2AResponse,
  A2ATaskParams,
  A2ATaskResult,
} from '@bradygaster/squad-sdk/remote/a2a';

// Client
import {
  GeminiA2AClient,
  createGeminiA2AClient,
  A2AError,
} from '@bradygaster/squad-sdk/remote/a2a';

// Builders
import { defineMesh } from '@bradygaster/squad-sdk/builders';
```
