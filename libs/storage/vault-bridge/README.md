# @chatic/storage-vault-bridge

**A `KeyValueStore` on the vault a shell keeps, reached over the bridge.** The mobile shell keeps it in
the iOS Keychain or the Android Keystore, the desktop shell in Electron's `safeStorage`; this store is
the page's side of it ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:foundation` · `platform:any` · `formfactor:any`. It imports no bridge: the entry point
hands it a `NativeStorageChannel` (`@chatic/bridges`' `BridgeStorageChannel` in a page, the device vault
in the phone's own process), so the bridge messages `StorageGet` · `StorageSave` · `StorageClear` and
their `medium` stay where they are.

| Export                 | Does                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| `NativeSecureStore`    | loads once (`hydrate`), answers from memory, sends a turn's writes as one save |
| `NativeStore`          | the store's shape: `KeyValueStore` plus `status`, `hydrate`, `flush`, `offer`  |
| `NativeStorageChannel` | `read` · `save` · `clear` — what the store asks of the shell                   |
| `isNativeStore(store)` | tells this store from a plain one                                              |

How it batches, when it falls back for the run and why unavailable is never read as empty:
[`@chatic/storage` § `nativeSecure`](../README.md#nativesecure-the-device-vault).

## How to verify

```bash
cd libs/storage/vault-bridge && ../../../node_modules/.bin/jest
```
