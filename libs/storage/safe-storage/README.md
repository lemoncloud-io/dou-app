# @chatic/storage-safe-storage

**The desktop shell's device vault, kept with Electron `safeStorage`.** One JSON `Record<string, string>`,
encrypted by the OS (Keychain on macOS, DPAPI on Windows, Secret Service or KWallet on Linux) into
`secrets.bin` in the folder the shell hands it. It is the `nativeSecure` medium the web reaches over the
bridge; how the shell answers `StorageGet` · `StorageSave` · `StorageClear` is in
[`apps/desktop`](../../../apps/desktop/README.md#device-vault-nativesecure)
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:desktop` · `formfactor:any`.

| Export                                                   | Does                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SecureStorage`                                          | the vault: `start`, `get` (a snapshot), `save(set, remove)`, `clear`; file system and cipher handed in |
| `safeStorageVault({ safeStorage, directory, platform })` | a `SecureStorage` on `directory/secrets.bin` (`SECURE_STORAGE_FILE`) with `node:fs`                    |
| `safeStorageStore(vault)`                                | a `KeyValueStore` over a vault, opened from one snapshot                                               |

The package does not import `electron`: the shell passes its `safeStorage` in, so the vault runs in
Jest with a fake cipher.

- The file name and the encryption are what installed shells already wrote; changing either signs
  every desktop user out.
- Linux's `basic_text` backend encrypts with a hard-coded key, so the vault calls itself unavailable
  there, as it does when encryption is not available at all.
- `safeStorageStore` reads from memory and writes each change through to the vault in order, without
  waiting. On an unavailable vault it opens empty and keeps nothing past the run. The contract is
  `KeyValueStore` from [`@chatic/storage-compose`](../compose/README.md).
