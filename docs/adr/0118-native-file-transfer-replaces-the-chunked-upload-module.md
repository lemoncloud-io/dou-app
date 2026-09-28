# ADR-0118: a direction-neutral native file transfer replaces the chunked upload module

> Status: Accepted · Decided: 2026-09-23
> Scope: `libs/app-messages/src/types/model/file-transfer.ts` · `apps/mobile/src/app/bridge/TransferManagerBridge.ts` ·
> `apps/mobile/src/app/webview/hooks/fileTransferHandlers.ts` · `apps/mobile/android/.../transfer/**` ·
> `apps/mobile/ios/Bridges/Transfer/**` · `apps/mobile/src/app/database/sqlite/schema.ts` (migration 11) ·
> `scripts/upload-test-server.js`
> Related: [ADR-0111](./0111-the-destination-decides-how-a-picked-image-is-prepared.md) (prepared image
> bytes live in web memory — the reason `WriteTempFile` exists) · ADR-0063 (the log upload queue's
> fetch-then-acknowledge shape, reused here)

## Context

Uploads are moving to presigned URLs: the web asks the upload API for a slot, receives a signed URL
and the headers it covers, and the bytes go to storage in **one PUT of the whole file**. The web still
owns asking for the slot and confirming the upload afterwards; what it needs from the shell is a way
to move large files that survives the app going to the background and can be cancelled.

The shell already had an upload module, and it implemented a different protocol. Both natives looped
over 1 MB chunks and POSTed each as multipart form data to an arbitrary endpoint; the JS service
persisted every task — including its endpoint URL and headers — in an `upload_tasks` SQLite table so
a restart could resume from a chunk offset. Against a presigned PUT none of that holds:

- **A PUT cannot resume.** There is no offset to continue from, so pause, resume, recover and retry
  lose their meaning.
- **The stored request is a credential.** The signed URL authorises the upload; writing it to disk is
  a leak, and it expires, so the stored copy cannot even be reused.
- **Two of the three background mechanisms did not work.** Android's `UploadWorker` called
  `setForeground` and returned success at once, so WorkManager contributed nothing but a persisted
  copy of its input. iOS created one background session per upload and, when the OS relaunched the
  app to deliver results, stored the completion handler without recreating the session — and called
  the handler immediately when React Native was not up — so results that landed while the app was
  gone were lost.

The only caller of the old messages was the debug panel's upload screen; no production code sent
them. That made a clean replacement possible rather than a compatibility layer.

## Decision

1. **One native module, `TransferManager`, with a direction-neutral contract.** Four requests
   (`StartFileTransfer`, `CancelFileTransfer`, `ListFileTransfers`, `AckFileTransfers`) and one event
   (`OnFileTransferState`). Only `upload` is implemented; `download` is in the type and rejected with
   `INVALID`, so a later download adds a direction instead of a second module.
2. **The shell reports HTTP responses; it does not judge them.** Any status is `responded` with
   `httpStatus` and the storage error code. `failed` means no response. Whoever knows the upload
   contract decides — `412` there means "already stored", which a shell-side judgement would have
   turned into a failure.
3. **Exactly one terminal event per transfer, held until acknowledged.** The event can be missed while
   the WebView is suspended or reloading, so the result stays readable through `ListFileTransfers`
   until `AckFileTransfers` releases it (at most 100 held).
4. **Nothing is persisted.** Results live in memory. The server, which checks storage when the web
   confirms, is the source of truth for anything lost with the process. Migration 11 drops
   `upload_tasks`.
5. **The registry is a process-wide native owner, and every rule lives in a platform-free core.**
   Android: `object TransferRegistry` (the foreground service only runs transfers and stops when they
   end). iOS: `TransferSessionOwner`, reachable from `AppDelegate` without React Native. The core is
   plain Kotlin / Swift with an injected clock; both platforms test it against the same sixteen
   numbered cases.
6. **Background.** Android runs a `dataSync` foreground service and handles the Android 15 limit of
   6 hours in 24 by ending running transfers as `failed(SYSTEM)` in `onTimeout`. iOS uses one
   background `URLSession` with a fixed identifier, uploads the original file, and restores running
   transfers from the session after a relaunch. The app's own code stops using WorkManager; the
   dependency stays pinned only because notifee pulls it in and would otherwise drop to an older version.
7. **No retries in native code;** the app decides how and when to retry.
8. **System notifications.** Android: the foreground-service notification with byte-weighted progress,
   a Cancel action and a tap target, plus a summary when a batch ends with failures. iOS: a local
   notification when a transfer fails in the background, and on iOS 26+ a continued-processing task
   that shows system progress and a cancel control. Its expiration is treated as a cancellation, and
   the app closes the task itself after 30 seconds without progress while the transfer continues.
9. **`WriteTempFile`** turns bytes that exist only in web memory into a temporary file the transfer
   can read.
10. **The old upload module is deleted** — natives, service, repository, handler, the sixteen old
    message types and the debug screen's old flow. The debug screen now drives the new messages
    against `scripts/upload-test-server.js`, a local stand-in for the storage endpoint.

## Alternatives

- **Adapt the chunked module to presigned URLs.** Rejected: the chunk loop, offsets and SQLite task
  state all exist to resume, and a PUT cannot resume. Keeping them would have kept the credential on
  disk for no benefit.
- **Let the shell decide success from the status code.** Rejected: the shell would duplicate a rule
  the upload contract already owns and get `412` wrong.
- **Persist tasks so a restart can resume or report them.** Rejected: the only thing worth persisting
  is the signed URL, which must not be persisted and expires anyway. Storage confirmation on the
  server covers the gap.
- **Fire the terminal event and forget it.** Rejected: a missed event leaves the web waiting forever;
  the acknowledge step costs one message.
- **Keep one background session per upload on iOS.** Rejected: the relaunch path has to find and
  recreate every session by identifier; one fixed session with the transfer id in `taskDescription` is
  enough to restore everything.
- **Keep using WorkManager for transfers.** Rejected: it did no work, and it persists its input data,
  which is exactly where a URL must not go. Removing the dependency outright was also rejected: notifee
  depends on it, and dropping our pin would have silently downgraded the version notifee runs on.
- **Retry network failures natively.** Rejected: retry policy is a product decision, and on iOS the
  background session already waits for connectivity while the app's own code is not running.
- **A Live Activity for iOS progress.** Rejected: it needs a widget extension target, and while the
  app is suspended a background session delivers no progress, so the bar would freeze.
- **Treat a continued-processing expiration as "close the UI, keep uploading".** Rejected: the OS
  reports the user's cancel and its own termination the same way, and ignoring the user's cancel is
  worse than cancelling on a rare system termination, which the web sees and can retry.
- **Plug the shell into the upload contract's generic presigned executor.** Not possible as it
  stands: that executor reads the whole file into JavaScript memory and hands bytes to an HTTP
  primitive, while this module streams from a file URI. The mobile shell needs its own executor
  (reading a URI, calling `StartFileTransfer`, judging `responded` by the contract's rule); that work
  belongs to the change that adopts the upload API, not to this one.

## Consequences

- The web gets a smaller, honest contract: it hands over a file and a signed request and learns what
  the storage said. Retry, success rules and "is the upload recorded" stay above the shell.
- Because the web ships before the app, a web build using these messages must handle `NOT_FOUND` from
  an installed shell that predates them.
- A result that ends while the app process is dead is not recoverable from the shell — by design. The
  web has to remember which uploads it started and confirm them with the server.
- iOS and Android differ in one visible way: on a dropped connection iOS keeps the transfer `running`
  and waits, Android reports `failed(NETWORK)`. Callers retry on `NETWORK` and wait on `running`.
- The core is platform-free and tested twice. Behaviour that only the OS can produce — a relaunch
  after system termination, a user force-quit, a real signature check — still needs a simulator,
  device or a real signer to confirm.
- Temporary files written by `WriteTempFile` stay until the OS reclaims them.
