# @chatic/db-sqlite-op

**The phone's SQLite file, opened with `@op-engineering/op-sqlite`.** It hands
[`@chatic/db-sqlite`](../sqlite/README.md) a driver on `dou.sqlite`
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`.

| Export                              | Does                                     |
| ----------------------------------- | ---------------------------------------- |
| `openOpSqlite(name?)`               | a `SqliteDriver` on the named file       |
| `openSqliteDatabase(logger, name?)` | a migrated `SqliteDatabase` on that file |
| `SQLITE_FILE_NAME`                  | `dou.sqlite`                             |

The file name is what installed apps already wrote; changing it drops every phone's chat cache and
invited clouds.
