# ADR-0313: A media send holds its cloud through the engine and uploads from the page

> Status: Accepted · Decided: 2026-11-15 · Implemented: `refactor/media-send-via-engine`
> · Scope: `libs/runtime-core/src/data/cloudChat.ts` (`holdCloud`), `RuntimeData.holdCloud`,
> `libs/runtime-core/src/bridge/repositories.ts` and `host.ts` (`data.holdCloud` as a listenerless
> stream); `libs/runtime/react/src/data/hooks/useSendImages.ts` and `dataCommands.ts`
> · The behaviour is documented in [app-runtime docs/data/image-send.md](../../libs/runtime/docs/data/image-send.md)
> and [runtime-core docs/bridge](../../libs/runtime/docs/remote/README.md)
> · Amends: [ADR-0256](./0256-a-chat-send-is-addressed-to-the-cloud-it-was-written-in.md) decision 1 —
> the image send no longer runs inside `runInCloud`

## Context

ADR-0309 lets the phone app's own process own the session, with the page mirroring it through the
runtime bridge. Everything the page reads or drives was moved behind the engine so it can be answered
from either process — except sending media. `useSendImages` held the room's cloud with
`runInCloud(cid, work)`: the hold lasted as long as a function the page passed in, and that function
made the upload requests, put the bytes and sent the message. A function cannot cross the bridge, and
neither can the picked `File` objects, so in a mirrored page that send had no way through. The module
docs said media send would become a command of its own before a page mirrored a runtime.

Every request the send makes was already on the page's repository graph and in the bridge contract:
`startUploads`, `completeUploads`, `sendPendingImageChat` and the pending-row writes are `data@cloud`
calls. Only the hold was missing.

## Decision

**The page keeps the bytes and the sequence; the engine holds the cloud and answers the requests.**

1. **`RuntimeData.holdCloud(cid)`** holds that cloud's socket slot and returns its release —
   `backgroundClouds.hold` with the same relay normalisation as every cloud-addressed call.
   `runInCloud` stays as the text send's helper and leaves the package barrel.
2. **Across the bridge the hold is a stream with no listener and no events**, like the sync's
   `registerTarget`: it stands while the page's subscription does. Unsubscribing releases it, and so
   does a new hello, which ends the last document's subscriptions — a page that reloads mid-send
   leaves no hold behind in the app's process.
3. **`useSendImages` takes the hold where `runInCloud` used to start** — after the shell's video
   conversion, before the connection wait and the first request — and makes each request on
   `getCloudRepositories(cid)`, releasing the hold when the send settles. The page uploads the bytes
   itself, through the `put` port, as before.

## Alternatives

- **A media-send command run in the session's process.** The page would hand over the files, which do
  not cross: a `File` is a page object, and copying a video's bytes over the bridge doubles its memory
  in the WebView for nothing — the page and the native transfer module can already reach the upload
  targets themselves.
- **Begin and end calls (`holdCloud` returning a hold id, `releaseCloud(id)`).** Plain calls, but a
  page that reloads between them leaks a hold the app's process would keep for the rest of the launch.
  A subscription already has an owner who ends it.
- **One call per session step, each holding the cloud itself.** The upload between `startUploads` and
  `completeUploads` would run unheld, and a cloud switch in those seconds could tear the slot down
  under the send.

## Consequences

- The web behaves as before: the same graph, the same hold, taken and released at the same points.
- A mirror engine implements `holdCloud` as a subscription it opens and ends. Its subscribe has to
  reach the app before the send's first call — the bridge carries the page's messages in order.
- An installed app older than this member answers the subscription `RUNTIME_NOT_AVAILABLE`. What the
  mirror does then — send without the hold, which only narrows the window a switch can hit — is its own
  decision, made with the mirror.
