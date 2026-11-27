# @chatic/storage-compose

**The `KeyValueStore` contract and the stores that wrap another store.** Every member of the `storage/*`
family implements `KeyValueStore`; this package declares it, and holds the wrappers that change how a
store behaves without being a medium of their own ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:foundation` · `platform:any` · `formfactor:any`. It imports nothing from the workspace.

| Export                | Does                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `KeyValueStore`       | `get` · `set` · `remove` · `clear` · `keys`, synchronous                                               |
| `StoreName`           | `webLocal` · `webSession` · `memory` · `nativeSecure` — the media a web page chooses between           |
| `TolerantStore`       | a failed read is absent, a failed write a no-op — for convenience state                                |
| `SwitchableStore`     | forwards to whichever store it points at — for state wired at import time, before the entry point runs |
| `asDomStorage(store)` | the store seen as a DOM `Storage` (`DomStorageAdapter`), for code that only takes that shape           |

**Why the contract lives here and not only in `@chatic/ports`.** The core packages declare their ports
against `KeyValueStore` (the session's `secret` and `plain`), and a core package may not depend on
`layer:contract`. So the type is declared in this foundation package and `@chatic/ports` re-exports it
beside `StoragePorts`; an implementation can take it from either.

The contract and its rules are in [`@chatic/storage`](../README.md#the-contract).

## How to verify

```bash
cd libs/storage/compose && ../../../node_modules/.bin/jest
```
