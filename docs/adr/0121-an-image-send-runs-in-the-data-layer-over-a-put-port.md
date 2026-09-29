# ADR-0121: an image send runs in the data layer, over a PUT port

> Status: Accepted (decision 4's local mirror is retired → [ADR-0124](./0124-upload-answers-are-checked-against-the-lemon-model-contract.md)) · Decided: 2026-09-28
> Scope: `libs/data/src/uploads/**` · `libs/data/src/remote/socket-data-sources/UploadSocketDataSource.ts` ·
> `libs/data/src/repositories/ChatRepository.ts` · `libs/app-messages/src/types/model/cache.ts` ·
> `apps/web/src/app/runtime/upload/**` · `apps/web/src/app/bridge/shellUpload.ts` ·
> `apps/web/src/app/features/channels/hooks/useSendImages.ts`
> Related: [ADR-0118 (native file transfer)](./0118-native-file-transfer-replaces-the-chunked-upload-module.md)
> (the native transfer module this uses) · [ADR-0111](./0111-the-destination-decides-how-a-picked-image-is-prepared.md)
> (how a picked image is prepared) · ADR-0036 (every data call goes through a repository)

## Context

The server side of image attachments is in place: `upload.start` issues a presigned PUT per image
(and one per thumbnail), `upload.complete` settles each upload, and `chat.send` takes the stored
ones as `uploadIds`. The native shell can PUT a file in the background (ADR-0118), and images can be
prepared for sending (ADR-0111). Nothing connected them. Several questions had to be answered by
whoever did:

- **Who runs the order** of prepare → start → PUT → complete → send, and who decides what to retry.
  The retry and re-issue rules are left to the app by the upload contract: a 403 means the signature
  probably expired, and a network failure may pass.
- **How three different PUT mechanisms fit.** The browser can only PUT from the page. The app has
  the native transfer module. An app built before that module has neither the module nor any way to
  say so except answering `NOT_FOUND`.
- **Where the optimistic message stands.** The photos take seconds to upload, and the message has to
  be on screen the whole time. `ChatRepository.sendChat` creates its optimistic row at request time,
  which is too late.
- **What the types are worth.** The SDK names the upload responses, but re-exports them from
  `lemon-model/upload`. The root `resolutions."lemon-model"` pin (1.2.2) predates that entry point,
  so under `skipLibCheck` every one of them is silently `any`.

## Decision

1. **The order runs in one pure function in `@chatic/data` — `sendImageMessage(files, ports)`.**
   Its ports are `prepare`, `start`, `complete`, `put` and `send`, and it knows nothing else: no
   repository, no shell, no UI library. The app's hook binds the ports to `ChatRepository`, to the
   shell's PUT sender, and to `prepareImage`. Being pure is what lets every rule be tested with fakes.
   `prepareImage` is a port rather than an import because its home, `@chatic/shared`, is a React UI
   library, and the data layer has no UI dependency.
2. **Only the PUT varies by shell, and it reports without judging.** `PutPort` answers
   `responded { httpStatus }` or `no-response { network | source | system }`. Success (2xx, and 412
   for "already stored"), the single per-slot re-issue on 403, and the two network retries at 1s and
   3s are decided in the sequence, once. Two senders implement the port: `xhrPut` for the browser
   and as the old-app fallback, and `nativePut` (temp file → `StartFileTransfer` → terminal state →
   `AckFileTransfers`). The first `NOT_FOUND` switches the page to `xhrPut` for the rest of its life.
3. **Upload calls go through a data source and the chat repository.**
   `upload.start` / `upload.complete` are bound in `socketFactory`, wrapped by
   `UploadSocketDataSource`, and exposed as `ChatRepository.startUploads` / `completeUploads`, like
   every other call (ADR-0036). A second repository would own no state of its own.
4. **The data source checks the answer's shape against a local mirror.** `uploads/types.ts` holds
   only the fields the sequence reads, copied from the `lemon-model` 1.5 upload contract, and a guard
   that rejects the whole operation on a mismatch. The mirror is deleted when the pin reaches 1.5.

    > Amended by [ADR-0124](./0124-upload-answers-are-checked-against-the-lemon-model-contract.md):
    > the pin reached 1.5 and the mirror is gone. The guard stays, and now narrows each answer to
    > the contract types the SDK re-exports.

5. **The pending row is written before any byte moves, with local-only slot names.**
   `ChatRepository.createPendingImageChat` writes `{ localStatus: 'sending', localThumbUrl }` slots.
   The server's names (`status`, `error`, `url`, `thumbnail`) are never used, because the server's
   `'failed'` is terminal and a local `'failed'` is retryable. The slot type widens
   `CacheChatView.upload$$` in the cache contract, not only the domain model, because the storage
   port is typed by the contract.
6. **The files are kept in page memory only, and leftovers are failed on attach.** A `File` cannot
   be stored, so a reload loses the message. The cache keeps the row, though, since neither backend
   evicts unsent rows. When the hook attaches to a channel it marks failed every older pending image
   row it holds no files for, and `canRetry` is false for those.

## Alternatives

- **Adopt the upload engine in `lemon-model` 1.5**, with an executor injected per shell. It already
  does concurrency, thumbnail sequencing and failed-slot completion. Rejected for now: taking it
  means lifting the `lemon-model` pin, and the pin moves the version every `chatic-*-api` type package
  sees. What the engine would contribute fits in one file here. When the pin lifts, the response
  mirror goes first, and adopting the engine becomes a smaller question.

    > Amended by [ADR-0124](./0124-upload-answers-are-checked-against-the-lemon-model-contract.md):
    > the pin lifted and the mirror is gone. Whether to adopt the engine is now a question about the
    > engine alone.

- **Put the sequence in the app hook.** It would sit next to the shell detection it needs, but the
  retry rules would then be written against React state and tested through a rendered hook. It would
  also leave nothing for `desktop-web` to reuse when it sends images: one XHR port is all that screen
  would need.
- **Let each PUT sender retry by itself.** That is natural for the native module, which already
  classifies failures. But the three shell paths would then hold three copies of the 403 and network rules,
  and the native module deliberately does not retry (ADR-0118).
- **Widen only the domain model's `upload$$`.** That is enough for reading, but writes fail: the
  storage port takes `CacheChatView`, so the domain row would no longer be storable without a cast
  at the storage boundary, which would be the same untruth moved one file over.
- **Keep pending image rows out of the cache**, holding them in memory and merging them into the
  rendered list. That would avoid leftovers entirely. It was rejected because it breaks the rule that
  a screen renders only what it observes from the local stream, and it would need changes on the
  render path.
- **Persist the intent** (`channelId`, `uploadIds`, `transferIds`, no URLs) and finish the send on
  the next boot. It closes the reload loss, but it opens a boot path and needs duplicate-send
  protection, and the wire has no idempotency key for `chat.send`. Left for later.

## Consequences

- An image message is at-most-once from one page's memory. A reload, a WebView restart or an OS kill
  mid-send loses it, and the user sees a failed, delete-only row. The server clears the orphaned
  uploads within a day.
- A retry after a failed `chat.send` uploads the images again. Uploads already stored by the failed
  attempt are abandoned rather than reused.
- On an app built before the transfer module, uploads run only while the app is in front.
- The response mirror and `PendingUploadSlot` have to be kept by hand until the `lemon-model` pin
  lifts. The guard makes a server shape change fail loudly instead of silently.

    > Amended by [ADR-0124](./0124-upload-answers-are-checked-against-the-lemon-model-contract.md):
    > of the two this bullet names, only `PendingUploadSlot` is still kept by hand. It is local state,
    > not a copy of a server type.

- `CacheChatView.upload$$` now admits local slots. The native shell stores chat rows as a JSON blob,
  so this needs nothing from it, and every reader of `upload$$` must use `isPendingUploadSlot` to
  tell the two kinds apart.
- Text optimistic rows keep their older behaviour: a reload mid-send leaves `isPending` set forever.
  The sweep covers image rows only.
