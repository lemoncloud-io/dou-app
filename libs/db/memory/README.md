# @chatic/db-memory

**The runtime's cache port held in memory.** Tables per domain, account and cloud, gone when the process
ends — for a Node tool that keeps nothing, and for tests ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). The contract is
`CachePort` from [`@chatic/ports`](../../contracts/ports/README.md) (`@chatic/data`'s `LocalCachePorts`).

Tags: `layer:adapter` · `platform:any` · `formfactor:any`.

| Export            | Does                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `memoryDbPorts()` | the cache port: every domain on the `memory` route (`MEMORY_DB_ROUTE`), another route throws |

- Rows are kept per `type:cid:uid`, from the data layer's session scope; with no signed-in user nothing
  is read or written, like the other engines.
- Rows are stored as JSON, so what a caller changes after a save does not reach the table, and each save
  stamps the TTL meta (`withCacheMeta`).
- `chat` reads follow the IndexedDB chat executor: with a `channelId`, that channel's rows newest first by
  `chatNo`, below `cursorNo` when one is given, `limit` of them (20 by default), plus the unsent rows when
  `includeUnsent` is set with no cursor. Other domains, and a chat read with no `channelId`, return the
  whole partition. Global search answers nothing and metrics count nothing.
