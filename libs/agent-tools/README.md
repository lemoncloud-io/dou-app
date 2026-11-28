# @chatic/agent-tools

**The MCP tool list and its permission gate, in TypeScript.** Fourteen tools let an AI agent read and write chat
through the headless runtime. The package is transport-free: it exports a registry of `{ name, description,
inputSchema, handler }` that an MCP server (`apps/dou-cli`) mounts, and it holds the gate every tool passes.

Tags: `layer:feature` · `platform:any` · `formfactor:any`. No React, no files, no sockets, no MCP SDK. Node-only work
(settings file, `mcp.sock`) belongs to `apps/dou-cli`.

```ts
import { createAgentTools, parseSettings, runtimeBackend } from '@chatic/agent-tools';
import { runtime } from '@chatic/runtime';

const { tools, dispose } = createAgentTools({
    backend: runtimeBackend(runtime),
    getSettings: () => parseSettings(readSettingsJson()),
});
```

- `runtimeBackend(runtime)` is the only place that touches `@chatic/runtime`: rooms through the channel repository,
  messages and reactions through the chat repository, sends through `runtime.data.sendChatInCloud`. Tools never
  call HTTP. A compile-time check in `runtimeBackend.test.ts` keeps the adapter assignable from the real runtime facade.
- `getSettings` is injected and read on every call, so a changed `settings.json` takes effect without a restart.
- Tests use `@chatic/agent-tools/testing` (`fakeBackend`), not the network.

## Limits

- Search is local only: the runtime does not expose relay search, so `messages_search` scans the cached messages of the
  room and reports that in `relayError`.
- The event buffer is in memory; a restart loses the cursor.
- `room_members` reports every member as `member` and not left; the runtime gives no role.
- Search results carry `localOnly: true` instead of a relay error.
- Events of every kind are shown only for rooms on `allowRooms`, and the gate is checked again after `events_wait` returns.
- A reply counts as a reply to me when its parent is in the local cache and I wrote it.
- Incoming events come from `chat.observeLastList`, so only the newest message per room is seen between two updates.

## Docs

- [Tools](./docs/tools/README.md) — names, inputs, outputs and the untrusted-content envelope.
- [Permissions](./docs/permissions/README.md) — tiers, allowed rooms, rate limits and the `[AI]` marker.
