# @chatic/storage-keychain

**The phone's device vault, in the iOS Keychain or the Android Keystore through
`react-native-keychain`.** One JSON `Record<string, string>` in one keychain item. It is the
`nativeSecure` medium the web reaches over the bridge; how the app answers `StorageGet` ·
`StorageSave` · `StorageClear`, and the full read and write rules, are in
[`apps/mobile` device vault](../../../apps/mobile/docs/storage/device-vault.md)
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`.

| Export                                                | Does                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `SecureStorageService(logger, installFlag, bundleId)` | the vault: `start`, `get` (a snapshot), `save(set, remove)`, `clear`, `keyCount`      |
| `keychainStore(vault)`                                | a `KeyValueStore` over a vault, opened from one snapshot                              |
| `ISecureStorageInstallFlag`                           | what the vault needs to tell a fresh install; `MmkvSecureStorageInstallFlag` fills it |

- The keychain service is `<bundle id>.secrets` and the account is `vault`. Installed apps already
  wrote under those names; changing either signs every phone user out.
- The item is written `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` and, on Android, `AES_GCM_NO_AUTH`.
- The vault re-reads on the next foreground while iOS reports the keychain locked. The foreground
  signal is `AppState` unless a subscriber is handed in, so tests run without React Native.
- `keychainStore` reads from memory and writes each change through to the vault in order, without
  waiting. It refuses to open a vault that is locked or unreadable, so the caller falls back instead
  of taking it for an empty one and writing over it. The contract is `KeyValueStore` from [`@chatic/storage-compose`](../compose/README.md).
