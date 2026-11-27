# @chatic/storage-memory

**A `KeyValueStore` held in memory.** It lives as long as the process (or the page) and is gone after
it — for a Node tool that should keep nothing, for tests, as the web stores' fallback where there is no
web storage, and as the vault's in-memory copy ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). The contract is
`KeyValueStore`, from [`@chatic/storage-compose`](../compose/README.md).

Tags: `layer:foundation` · `platform:any` · `formfactor:any`. Foundation, not adapter, because the other
foundation stores (`web-local`, `vault-bridge`) are built on it; it takes nothing from `@chatic/ports`.

| Export                 | Does                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `MemoryStore`          | the store as a class, on a `Map`                                           |
| `memoryStore()`        | one `MemoryStore`                                                          |
| `memoryStoragePorts()` | the four storage roles — `secret`, `plain`, `device`, `tab` — a store each |

`@chatic/storage` re-exports `MemoryStore` under its old name.
