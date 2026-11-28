# @chatic/storage-mmkv

**The phone's file key-value storage, on `react-native-mmkv`.** The React Native app keeps its
preferences, config, boot metrics and log upload queue here, and the device vault keeps its reinstall
flag in a file of its own ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`.

| Export                         | Does                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `mmkvStore(file)`              | a `KeyValueStore` of plain strings over one MMKV file                                                |
| `MmkvStorage`                  | `IKeyValueStorage`: JSON-encoded values, sync and async reads, key list and byte length for a report |
| `MmkvSecureStorageInstallFlag` | the device vault's "already installed" flag, in the `secure-storage` MMKV file                       |

- `MmkvStorage` opens MMKV's default file unless it is handed one. Installed apps already wrote
  their preferences there, so the default stays.
- The install flag's file id (`secure-storage`) and key (`secure-storage.installed`) are what
  installed apps already wrote. Changing either makes the next launch look like a fresh install,
  which empties the vault and signs the user out.
- `mmkvStore` stores strings as they are; `MmkvStorage` JSON-encodes. Do not point both at the same
  file.
- The contract `mmkvStore` fills is `KeyValueStore` from
  [`@chatic/storage-compose`](../compose/README.md). The runtime's own files are opened by the
  app (`services/runtime/runtimeStorageFiles.ts`) and wrapped by `@chatic/runtime-mobile`.
