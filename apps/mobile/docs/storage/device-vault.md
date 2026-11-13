# Device vault (`nativeSecure`)

The device vault is a storage medium the shell keeps for the web: a small key-value store the iOS
Keychain or Android Keystore protects, for the values that must not sit in WebView storage (the
session's secrets). The web keeps a copy in memory and reads it synchronously; three bridge messages
fill that copy at boot and write it back. The contract — payloads, reasons, `reset` — is
`libs/bridge-messages/src/types/model/storage.ts`; this page is how the phone keeps it.

| File                                                             | Role                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/app/services/secureStorage/SecureStorageService.ts`         | The vault: start-up read, in-memory copy, serialized writes       |
| `src/app/services/secureStorage/MmkvSecureStorageInstallFlag.ts` | The reinstall flag, in its own MMKV instance                      |
| `src/app/webview/hooks/secureStorageHandlers.ts`                 | `StorageGet` / `StorageSave` / `StorageClear`, and the media list |
| `src/app/services/runtime/runtimePorts.ts`                       | The app runtime's `secret` store on the same vault, in-process    |
| `android/app/src/main/res/xml/data_extraction_rules.xml`         | Keeps the vault and its flag off cloud backup and device transfer |

## Where it lives

One keychain item, through `react-native-keychain`: service `<bundle id>.secrets` (the bundle id from
`DeviceInfo.getBundleId()`, so dev and prod builds never share one), a fixed account name, and the
whole vault as one JSON object of strings in the password. It is written with
`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` — readable in the background once the phone has been unlocked
after boot, never copied to another device — and, on Android, `AES_GCM_NO_AUTH`, so reading it never
prompts for biometrics. On Android the library keeps the ciphertext in the DataStore file
`datastore/RN_KEYCHAIN.preferences_pb` (migrated from the `RN_KEYCHAIN` SharedPreferences file) and
the key in the Keystore.

## The start-up read

`provider.ts` builds the service eagerly and calls `start()` in its constructor, so the read runs on
the native side while the WebView is still being created; the web's first `StorageGet` usually finds
it done, and one that arrives earlier waits for it. The values stay in memory for the run.

| Read outcome                                            | Answer                                   | Next                                                  |
| ------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Item read and parsed, or no item                        | `available`                              | —                                                     |
| iOS `errSecInteractionNotAllowed` (before first unlock) | `unavailable`, `locked`                  | Read again on the next `StorageGet` and on foreground |
| Android `E_CRYPTO_FAILED`, or JSON that does not parse  | Item deleted; `available`, `reset: true` | `reset` is reported until the web writes again        |
| Anything else                                           | `unavailable`, `error`                   | Read again on the next `StorageGet`                   |

**A read failure is never an empty vault**, apart from the undecryptable case. An empty answer tells
the web it is signed out, and its next save — the whole object — would overwrite what is really
there. An undecryptable item is different: nothing can read it again (the Keystore key was
invalidated, or the data came from another device's key), so it is deleted and the web is told with
`reset`, which signs the person in again.

## Writes

`StorageSave` applies `set` and `remove` to a copy, writes the whole JSON, and answers `ok: true` only
once the keychain write resolved; the copy in memory changes only then. Writes and clears run one at a
time, in the order they arrived, and each waits for the start-up read. A failed write — or a save
while the vault could not be read — answers `ok: false` and leaves the vault `unavailable`/`error`
for the rest of the run: the keychain and the copy may now differ, and the web is told to stop
relying on either. `StorageClear` deletes the item and empties the copy, `ok` only once the delete
resolved.

## Reinstall

iOS keeps keychain items across an uninstall; app storage is removed. So an MMKV flag,
`secure-storage.installed`, marks an install that has set the vault up. When it is absent at start,
the item is deleted first and the flag written after — an item found without the flag belongs to the
previous install and must not sign this one in. If that delete fails (the keychain is locked), the
flag stays unset and the next launch tries again.

The flag is in its own MMKV instance (`secure-storage`), not the shared default one, because Android
excludes files from backup and device transfer one file at a time — excluding the default instance
would keep every preference from moving to a new phone.

## Android backup and device transfer

`allowBackup="false"` already turns off cloud backup, but from Android 12 it does not stop a
device-to-device transfer. `data_extraction_rules.xml` excludes the keychain DataStore file, the
legacy SharedPreferences file, and the `secure-storage` MMKV files from both. The ciphertext would be
useless on the new phone anyway — the Keystore key never leaves the old one — and would only arrive
as an item to reset.

The app runtime's own MMKV files — `chatic-runtime-plain`, `chatic-runtime-device` and
`chatic-runtime-mode` — are excluded from both too. The plain store holds the session's other half —
the device id, the cloud identities, the selected cloud — which means nothing beside a vault that
stayed behind, so a new phone starts both fresh; and it starts with the page owning the session, as a
fresh install does, rather than with the runtime owning stores that did not come along. The page's copy
of the same values sits in the WebView's own storage, which these rules do not cover; it is the page's
until the app runs the session.

## Who may ask

The handlers are registered on the main WebView's host only, which already drops messages from an
untrusted origin; the sub WebView's host never answers them. A `medium` other than `nativeSecure`, or
a malformed `StorageSave`, is answered with `INVALID`. The shell announces the medium before the page
runs: `CHATIC_APP_STORAGE_MEDIA = ['nativeSecure']` in the injected script
([../webview/README.md](../webview/README.md#injection)).

**The page, or the app's runtime — never both.** The app can run the session itself, in its own JS
process, through `@chatic/runtime-mobile`. That runtime keeps its `secret` store on this same vault,
in-process (`services/runtime/runtimePorts.ts`): the same item and the same keys, so the session a page
signed in is the one the runtime reads, with nothing to move. Everything in the vault is the session's
four tokens. So once the app holds the session, the handlers take an `ownsSession` flag and the page is
answered as by a vault it cannot use: `StorageGet` is `unavailable` (`error`) without a read, and
`StorageSave` and `StorageClear` are `ok: false` without a write. The refusal is logged once per kind
of message, not on every ask. The flag is read on every message and is off — the page holds the
session — until the app starts running it.

The refusal keeps the page away from the runtime's tokens; on its own it does not keep the page from
holding a session. A page told its vault is unavailable falls back to the tab's storage for the run,
and signs in from a copy of the tokens left in `localStorage` if one is there; a page logout answered
`ok: false` leaves its "clear the vault next boot" marker set. So the switch that turns the flag on
also tells the page, before it runs, that the vault is not its medium (the shell stops announcing
`nativeSecure`), and the page then runs without a session of its own — the refusal is the backstop
behind that, not the switch.

## Debug panel

`FetchNativeStorageSummary` adds one row for the vault at the end of its MMKV list, `vault:nativeSecure`,
with the number of keys as `count` and `bytes` always 0 — never a value or a size that hints at one.
While the vault is unavailable the row carries `error: 'unavailable'`.

Values never reach a log line either: the service logs counts and error codes only.
