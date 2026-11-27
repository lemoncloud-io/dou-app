# @chatic/db-bridge

**The db port's tables in the shell's SQLite, reached over the bridge.** The page asks; the app's database
answers. One call is one bridge round trip, so the batch reads exist for exactly that reason ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:any` · `formfactor:any`. The bridge messages (`FetchManyCacheData`,
`FetchLastChatsData`, `ClearCacheDataByChannel`, the room media index ones and the rest) keep their names
and shapes; the client is handed in (`CacheBridgeClient`), so the same tables run in a page and in the
phone's own process.

| Export                     | Does                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `NativeDBAdapter`          | a `DbTable` over the bridge, with in-flight read sharing and batch reads |
| `NativeGlobalSearchSource` | `DbSearchSource` answered by the app's database                          |
| `NativeCacheMetricsSource` | `DbMetricsSource`: per-operation counts and times of the bridge calls    |
| `CacheBridgeClient`        | the client the tables are handed                                         |

How the store behaves: [`@chatic/db` § The native store](../README.md#the-native-store).

## How to verify

```bash
cd libs/db/bridge && ../../../node_modules/.bin/jest
```
