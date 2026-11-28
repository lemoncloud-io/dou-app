# storage

The `nativeSecure` medium: where the web keeps its session on this device.

`crates/vault` holds one JSON record of strings, sealed with ChaCha20-Poly1305 into `secrets.bin` in the app data directory (nonce first, then the sealed bytes). The 32-byte key is generated once and kept in the OS credential store (Keychain on macOS, Credential Manager on Windows), so the record is not limited by the credential store's size cap and a copied file is useless without the account's keychain.

- **Start.** The file is read when the app starts, before the first page is served.
- **Unavailable for the run.** The key cannot be read or created, or the file cannot be read. `StorageGet` answers `unavailable` / `error`, saves answer `ok: false`.
- **Reset.** A file that does not decrypt, or decrypts to anything but a string record, came from another keychain or is damaged. It is deleted and the vault starts empty with `reset: true`, so the web signs the person in again. The flag drops after the next save or clear.
- **Save.** The change is applied to a copy, sealed and written to `secrets.bin.tmp`, then renamed over the vault. `ok: true` is answered only after the rename. A failed write answers `ok: false` and leaves the vault unavailable for the rest of the run.
- **Clear.** Deletes the file and empties memory.
- A medium other than `nativeSecure`, or a save whose `set` is not a string record or whose `remove` is not a string list, is answered `INVALID`.

This repeats the behaviour of the Electron shell's device vault (`apps/desktop/README.md`, Device vault), with its own encryption and key store.
