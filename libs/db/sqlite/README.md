# @chatic/db-sqlite

**The app SQLite database, without the file.** The schema and its migrations, the table names, the
per-domain data sources, the cache contract the shell promises the web, and the cache services that
answer the web's cache messages. The file is opened by a driver handed in, so the same schema can run
on the phone ([`@chatic/db-sqlite-op`](../sqlite-op/README.md)) and, later, in Node
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:any` · `formfactor:any`.

| Export                                                                                 | Does                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `SqliteDriver`, `SqliteExecutor`, `SqlQueryResult`, `SqlScalar`, …                     | the driver contract: `execute`, `executeBatch`, `transaction`, `close`                  |
| `SqliteDatabase(logger, driver)`                                                       | `ISqliteDatabase`: migrates to `TARGET_VERSION` in one transaction, queries wait for it |
| `MIGRATIONS`, `TARGET_VERSION`, `TABLES`                                               | the schema, one migration step per `PRAGMA user_version`                                |
| `CACHE_DOMAIN_CONTRACTS`, `deriveCacheDomainVersions(userVersion)`                     | the per-domain cache versions a database at that schema version serves                  |
| `ChatDataSource`, `ChannelDataSource`, … `TestRecordDataSource`                        | one table each: row mapping and SQL                                                     |
| `CacheCrudService`, `CacheSearchService`, `TestRecordService`, `SUPPORTED_CACHE_TYPES` | the cache reads and writes the web asks for, and the local search                       |

- Table names, the migrations and the version numbers are what installed apps already hold. A change
  is a new migration step, never an edit to an old one.
- A failed migration is logged and queries still run, as before.
- How the app wires this and answers the bridge is in
  [`apps/mobile` cache](../../../apps/mobile/docs/storage/cache.md).
- `src/testing/realSqliteDatabase.ts` runs the SQL on an in-memory `better-sqlite3` in tests; it is not
  exported.
