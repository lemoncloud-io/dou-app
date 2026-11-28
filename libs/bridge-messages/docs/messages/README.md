# Message catalogue

One line per message on the web↔native bridge: which way it goes, what it does, and the payload
notes a field's name and type do not already say. The types themselves are the source of truth
(`src/types/model/`); this is the part you cannot read off them. How to add a message is in the
[package README](../../README.md#adding-a-message).

| Area                              | File                                                               | Source                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Handshake, device and OS surfaces | [system.md](./system.md)                                           | `system.ts`, `device.ts`, `clipboard.ts`, `haptic.ts`                                                                      |
| Files, photos and attachments     | [files-and-media.md](./files-and-media.md)                         | `file-transfer.ts`, `media-export.ts`, `attachment-picker.ts`, `audio-recording.ts`, `photo-library.ts`, `share-intake.ts` |
| Local cache                       | [cache.md](./cache.md)                                             | `cache.ts`                                                                                                                 |
| Session, storage and sign-in      | [session-and-storage.md](./session-and-storage.md)                 | `runtime.ts`, `session-owner.ts`, `storage.ts`, `config.ts`, `preference.ts`, `auth.ts`                                    |
| Sub WebView                       | [sub-webview.md](./sub-webview.md)                                 | `sub-webview.ts`                                                                                                           |
| Push, purchases and updates       | [notifications-and-purchases.md](./notifications-and-purchases.md) | `notification.ts`, `iap.ts`, `update.ts`, `app-update.ts`, `unfurl.ts`                                                     |
| Diagnostics and debug panel       | [diagnostics.md](./diagnostics.md)                                 | `common.ts`, `perf.ts`, `native-storage.ts`, `custom-zip.ts`, `test-record.ts`                                             |

## Conventions that hold for every message

- **Direction.** "web→native" is a request the web sends and the shell answers; "native→web" is a push
  with no request behind it. Every request is answered by the `On…` message that
  `WEB_MESSAGE_RESPONSE_TYPE` names (a few reply names are not `On<Request>`; they are called out).
  A reply is listed with its request, not on its own line.
- **Failure** travels in the envelope's `error.code`, not in the payload. A code a page or the web does
  not know is treated as a failure of that request: codes are added, never renamed.
- **The web ships before the app.** A shell without a handler answers `NOT_FOUND`, and the web reads
  that as "this shell cannot do it" and falls back. Where a message needs the fallback to be
  decided up front, the web instead reads the handshake's `supportedWebMessages`
  (see [system.md](./system.md)). A new field on an old message is optional for the same reason: an
  older shell ignores it, and the reply says whether it was honoured.
- **`since 2.x.y`** is the bridge protocol version that introduced a message or field
  (`libs/bridge/host/src/version.ts` keeps the per-version list). Phone shells from app 0.30.0 on list their
  handlers in the handshake.
- **Empty payloads.** An empty object type is "nothing to carry". A reply described as
  "acknowledgement" carries no data.
- **Long waits.** Several replies arrive only when a system sheet or a long copy finishes. Those are
  marked; the caller must wait longer than its default request timeout.
- **Bytes stay off the bridge when they are large.** Videos and documents are passed by `file://` URI
  inside the shell's own folders; only photos and small frames cross as base64.

## Bridge errors

`BridgeError` extends the envelope's error. `code` is a `BridgeErrorCode` (`NOT_FOUND`, `TIMEOUT`,
`INTERNAL_ERROR`, `NATIVE_NOT_SUPPORTED`, `RESPONSE_TYPE_MISMATCH`, `MALFORMED_RESPONSE`) or any string, so a domain
handler's own code passes through. `reason` is an internal description for classifying the cause in logs, separate
from the human-readable `message`; `traceId` correlates one failure across log systems. A bridge-level failure
travels as a message of type `ERROR`, which is not part of the `AppMessage` union.
