# @chatic/runtime-node

**The Node adapter: the headless runtime in a Node process.** A command-line tool, a local MCP server or a
small service runs the same session, sockets, sync and data layer as the apps, with no browser and no
shell. This package holds the ports that are true of a Node process — a socket opened by Node's own
`WebSocket` with the handshake header the relay checks, a process that is always in the foreground — and
hands them on as adapters a runtime declaration plugs in, beside the storage, db and host families it
assembles ([ADR-0375](../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). It is the Node counterpart of
[`@chatic/runtime-web`](../runtime-web/README.md) and [`@chatic/runtime-mobile`](../runtime-mobile/README.md).

Tags: `layer:adapter` · `platform:node` · `formfactor:any`. No DOM, React or React Native: every
project here compiles against `lib: ["es2022"]` and Node's types only, and the `platform:node` lint
constraint bans the UI frameworks.

```ts
import {
    authNode,
    cacheMemory,
    defineRuntime,
    foregroundNode,
    headlessModules,
    hostNode,
    nodeHostFacts,
    startRuntime,
    storageFile,
    transportNode,
} from '@chatic/runtime-node';

const started = await startRuntime(
    defineRuntime({
        name: 'dou-cli',
        facts: nodeHostFacts({ userAgent }),
        modules: headlessModules(),
        ports: {
            storage: { default: storageFile(directory) },
            transport: { default: transportNode() },
            auth: { default: authNode() },
            cache: { default: cacheMemory },
            foreground: { default: foregroundNode },
        },
        host: hostNode({ writeLine }), // stdout by default; pass stderr when stdout is a protocol stream
        config: { env }, // the app's ConfigRuntimePorts
    })
);
```

The caller names its config ports (`@chatic/config`): no library picks a Node process's stage or
endpoints for it. `src/nodeBoot.test.ts` boots the `headless` preset this way in Jest's Node
environment.

| Export                                          | Does                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeTransportPorts({ userAgent, WebSocket? })` | the transport port: always online, `appPlatform: 'node'`, sockets from Node 22's global `WebSocket` (or the one passed) with `User-Agent` set |
| `nodeForegroundPorts()`                         | the foreground port: always foreground, never changes                                                                                         |
| `nodeAuthPorts({ search?, leaveToHome? })`      | the auth port: no address bar, so `currentSearch` is `search` (empty) and `leaveToHome` does nothing unless given                             |
| `nodeHostFacts({ userAgent })`                  | the declaration's facts: a frozen `{ platform: 'node', userAgent }`                                                                           |
| `defineRuntime`, `startRuntime`, module values  | `@chatic/runtime`'s, handed on so a Node entry imports one package                                                                            |

### The adapters

| Export                    | Id                | Builds                                                                                     |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `transportNode(options?)` | `transport.node`  | `nodeTransportPorts`, the user agent from the facts                                        |
| `foregroundNode`          | `foreground.node` | `nodeForegroundPorts()`                                                                    |
| `authNode(options?)`      | `auth.node`       | `nodeAuthPorts(options)`                                                                   |
| `storageFile(directory)`  | `storage.file`    | [`@chatic/storage-file`](../storage/file/README.md): one JSON file per role in `directory` |
| `storageMemory`           | `storage.memory`  | [`@chatic/storage-memory`](../storage/memory/README.md): gone when the process ends        |
| `cacheMemory`             | `cache.memory`    | [`@chatic/db-memory`](../db/memory/README.md): the cache port, gone when the process ends  |
| `hostNode(options?)`      | `<port>.node`     | the eight host ports from [`@chatic/host-node`](../host/node/README.md)                    |

## Limits

- **Signing in.** A Node process signs in by device pairing: `pairNode` in [`@chatic/host-node`](../host/node/README.md) requests a pairing and ends it for both a relay and a cloud approval, and the session lands in the `storageFile` directory. Nothing approves a pairing from Node, and there is no provider or OAuth sign-in. [`apps/dou-cli`](../../apps/dou-cli/README.md) is the caller (`dou-cli pair`).
- **Reporting an issue.** `startRuntime` here is `@chatic/runtime`'s own, with no platform handed in, so
  `runtime.report.reportIssue` rejects; a Node reporter is a later step.
- **Waking after sleep.** The process is always online and in the foreground, so no online or visible
  event ever fires; after the machine sleeps, the sockets recover from their close events and the
  credential guards' timers alone.
- **No persistent db yet.** `cacheMemory` forgets everything when the process ends; a file database
  (`db/sqlite` over a Node driver) is a later step.
- **One process per directory.** `storage.file` reads its files once and writes them whole; two processes
  on one directory overwrite each other.
