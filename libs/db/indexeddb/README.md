# @chatic/db-indexeddb

**The db port's tables in the browser's IndexedDB.** One database (`ChaticWebCacheDB`), one object store,
one connection for the page; chat paging through an index; quota recovery; and the cross-cloud search over
the same rows ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:any` · `formfactor:any` — `any` for now, for the reason in
[`@chatic/db`](../README.md#directories--the-db-family).

| Export                        | Does                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `IndexedDBDatabase`           | the connection and schema (`IndexedDbConnection`)       |
| `IndexedDBAdapter`            | a `DbTable` with its per-channel cap and quota recovery |
| `ChatQueryExecutor`           | chat paging (`DbQueryExecutor`)                         |
| `IndexedDbGlobalSearchSource` | `DbSearchSource` over the rows of every cloud           |
| `isQuotaExceededError`        | tells a full-quota `DOMException` from other failures   |

How the store behaves: [`@chatic/db` § The web store](../README.md#the-web-store).

## How to verify

```bash
cd libs/db/indexeddb && ../../../node_modules/.bin/jest
```
