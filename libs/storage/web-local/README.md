# @chatic/storage-web-local

**A `KeyValueStore` over this origin's `localStorage`.** It survives a reload and a relaunch
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:foundation` · `platform:any` · `formfactor:any`.

| Export            | Does                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `webLocalStore()` | the store on `localStorage`                                                            |
| `WebStore`        | the class under it: `WebStore.local()`, `WebStore.session()`, `WebStore.over(storage)` |

`WebStore` keeps its `session()` factory so that `@chatic/storage`'s old name answers as before;
[`@chatic/storage-web-session`](../web-session/README.md) is the package that names that medium.

- **It reads the storage itself on every call**, never a copy (see [`@chatic/storage`](../README.md)).
- **Where there is no web storage**, or touching it throws, `over()` hands back a `MemoryStore` from
  [`@chatic/storage-memory`](../memory/README.md) instead, so a caller never has to ask which it got. That
  is also why the tag is `platform:any` and not `web`: `@chatic/session` (any) defaults to a
  session-storage store until an entry point configures it, and runs in the phone's React Native process
  on the memory fallback.

## How to verify

```bash
cd libs/storage/web-local && ../../../node_modules/.bin/jest
```
