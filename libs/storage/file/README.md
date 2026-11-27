# @chatic/storage-file

**A `KeyValueStore` kept in a JSON file.** A Node process's persistent store: it reads the file once
when it is built and writes it whole on every change, through a temporary file that is flushed to disk
and then renamed, so a crash leaves the old file or the new one ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)). The contract is `KeyValueStore`, from
[`@chatic/storage-compose`](../compose/README.md); the four roles are [`@chatic/ports`](../../contracts/ports/README.md)' `StoragePorts`.

Tags: `layer:adapter` · `platform:node` · `formfactor:any`.

| Export                        | Does                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `fileStore(path)`             | one store on `path`; the folder is made if missing (`0700`), the file is written `0600`                                        |
| `fileStoragePorts(directory)` | the four storage roles: `secret.json`, `plain.json` and `device.json` in `directory` (`FILE_STORE_NAMES`), and `tab` in memory |

- A missing file reads as empty. A file that is not a JSON object reads as empty with a warning, and the
  next change overwrites it.
- Values stay in memory after the read: two stores on one file, in one process or two, overwrite each
  other. Build one store per file.
- `secret` is a plain file readable by its owner only, not an OS keychain.
- `tab` is a `MemoryStore`: a process has no tab, so what a tab would keep ends with the process.
