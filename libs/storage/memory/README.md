# @chatic/storage-memory

**A `KeyValueStore` held in memory.** It lives as long as the process (or the page) and is gone after
it — for a Node tool that should keep nothing, and for tests ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). The contract is
`KeyValueStore`, read from [`@chatic/ports`](../../contracts/ports/README.md) as `StoragePort['device']`.

Tags: `layer:adapter` · `platform:any` · `formfactor:any`.

| Export                 | Does                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `memoryStore()`        | one store on a `Map`                                                     |
| `memoryStoragePorts()` | the runtime's storage port: `secret`, `plain` and `device`, a store each |

`@chatic/storage`'s `MemoryStore` is the same store as a class; the two meet when that package is split
into the `storage/*` family.
