# ADR-0106: chat attachments ride in message `content`, and the client declares which transfer it can do

> Status: Accepted · Decided: 2026-09-18 · Implemented: `facf7012` (PR #469)
> Scope: `libs/http/src/gateways/uploads.ts` · `libs/shared/src/upload/**` ·
> `libs/data/src/domain/{chatUploads,chatAttachments}.ts` · `libs/config/src/registry/net.ts`
> (`net.uploads.endpoint`) · `package.json` (`lemon-model` `1.2.2` → `1.4.0`)
> Related: [ADR-0082](./0082-desktop-message-images-client-side-seam.md) (the reader seam this fills —
> it is continued here, not superseded) ·
> [ADR-0049](./0049-feedback-photo-attachment-inline-base64.md) (the other attachment surface, which
> went base64 for reasons that do not hold for chat)

## Context

[ADR-0082](./0082-desktop-message-images-client-side-seam.md) built the message-image UI against no
server at all. It held the whole thing together with two rules: every read goes through one reader
(`useChatImages`), and a send carrying an attachment is rejected outright rather than silently
dropping the image. Both existed to make one future change cheap — "once the upload API exists, this
reader changes, not the components."

That API now exists. The upload contract and its transfer engine ship as a versioned package
(`lemon-model` 1.4.0), and the upload service implements both transfer methods against real storage.
What was missing was everything on the client side of it: the four operations behind an
authenticated call, the shell primitives the engine injects (bytes, digest, raw PUT), and a way to
put a finished upload onto a message.

None of that depends on which screen sends the attachment, which is why it lands as one layer with
no caller yet. The decisions below are the ones that could not be deferred to whichever screen goes
first — each of them fixes something every future surface inherits.

Two facts about the environment shaped all four:

- **The socket contract has no attachment field.** `chat.send` takes channel, content, contentType,
  parent, stereo and subType; the chat view returns nothing more. Changing that is another team's
  release, on another schedule.
- **The server picks the transfer method, and does not fall back.** The client declares which
  methods it can execute; the server chooses the first of those it can also do. If the chosen one
  turns out to be wrong for the file, nothing downgrades it.

## Decision

### 1. An attachment message carries a manifest inside `content`

`content` holds a small JSON object — `{ text, uploads: [{ id, name, url, contentType, contentSize,
width, height }] }` — instead of the sender's plain text. `libs/data`'s `chatUploads` owns building
it and reading it back, so every surface (feed, thread, home preview, notification, search) reads
attachments the same way.

The manifest carries `url` so a receiver draws the message without a second call, the contract
fixing upload urls as stable and public. It also carries `id`, so post-processing that lands later —
a thumbnail, pixel dimensions — can be fetched by id without a second wire change.

This is the route Block Kit already took in this repo: it started inside `content` and was absorbed
by a reader priority once the server grew a field of its own. **Keeping that exit open is the point
of the decision, not a consolation.** When an attachment field appears on the wire, the reader gains
one branch ahead of this one and nothing else in the app moves.

Block Kit also paid for the trap this avoids, so it is worth stating: **the judgement is on the
content, never on `contentType`.** The domain mapper spreads whatever the server stamped, and the
client's own send path defaults to `'text'` — so a marker-based reader passes every unit test and
then reports "no attachments" for every real message. `contentType` is written (a uniform batch
reports its MIME, a mixed one a generic marker) purely as a hint for whatever indexes messages
later; no reader depends on it, which is why getting it wrong cannot break the feature.

### 2. The executor array's order is the capability declaration

`browserExecutors` returns `[PresignedPutExecutor, InlineExecutor]`, in that order, and that array
is the whole of what the client tells the server it can do.

Because the server takes the first method it can also execute and never falls back, **reversing
those two lines would cap every attachment at the inline ceiling** — roughly 4.5 MB, the synchronous
payload limit minus base64 growth, which is below an ordinary phone photo. Nothing would report an
error; large files would simply stop being sendable.

A shell that cannot hold bytes in this process declares that by omission rather than by preference:
`inline: false` drops the inline executor, and a native shell that moves bytes in a background
session replaces the set entirely (`createUploadEngine({ executors })`). Declaring a method it
cannot really perform is the failure mode this shape prevents — the server would hand it a slot it
can only abandon.

### 3. The four operations are a signing-only gateway, with its endpoint injected

All four (`start`, `send`, `complete`, `read`) go through the signed relay executor, like every other
domain in `libs/http`. They have to: the deployed routes sit behind IAM authorization and the
signature is computed per request **over the body**, so they cannot be delegated to anything that
only carries a header map — a native bridge, for one. The single unauthenticated hop is the
presigned PUT, and it never passes through this gateway.

The endpoint is **injected as a function** rather than added to the route table. Destination and
signing are independent here, and a route-table entry would imply a signing strategy this service
does not have one of — it signs the relay way, at a different host. Resolving per call is what keeps
a deep-link override working. The address itself became a config key (`net.uploads.endpoint`,
`internal` surface, writable by nobody) so it follows the same rule as every other endpoint: a
remote config must not be able to move where the app talks to.

### 4. The manifest reader is the trust boundary

A manifest is written by whoever sent the message and ends up in an `<img src>`. So the parser, not
each render site, refuses what cannot be drawn safely:

- **`http(s)` only.** `javascript:` and `data:` urls are rejected before any renderer sees them.
  Relative or malformed urls are rejected too — there is nothing safe to resolve them against.
- **At most 10 attachments drawn per message.** The composer stops at ten, but a hostile or buggy
  sender can claim any number, and a list screen would dutifully build every tile.
- **Sizes that cannot be laid out are dropped** rather than passed through as zero or negative
  dimensions.
- **A manifest with nothing drawable still reads as a manifest.** An empty `uploads` array, or one
  whose every entry was refused, yields its text and no uploads — an empty gallery is worse than
  none, but answering "not a manifest" would make the surfaces print `content` verbatim, and that
  is how refusing an unsafe url ends up displaying that url. The text stands on its own instead.

`apps/web` already guards webhook attachment links with the same scheme rule one layer up. Putting
it in the parser is what makes every surface inherit it instead of each one remembering.

The composer-side limits from [ADR-0082](./0082-desktop-message-images-client-side-seam.md) moved
into this layer alongside it (`chatAttachments`), unchanged except for a new per-file size ceiling.
That ceiling is a **memory budget, not the server's limit**: the engine reads a file whole to send
it, so the real constraint is the phone's heap. They moved because the mobile composer needs the
identical set — two copies would become two different maximum photo sizes, and which one a user hit
would depend on which app they opened.

## Alternatives

- **Wait for an attachment field on the socket contract.** Cleaner on paper, and it blocks this work
  on another repo's release. Block Kit is the precedent that decided it: the same bet was taken, the
  server caught up, and the absorption cost one reader branch. Rejected because the wait is
  open-ended and the exit is cheap.
- **Carry the bytes in the message body as base64, the way feedback photos do
  ([ADR-0049](./0049-feedback-photo-attachment-inline-base64.md)).** Rejected for the reason
  [ADR-0082](./0082-desktop-message-images-client-side-seam.md) already gave: a chat message
  propagates to every participant's cache and over the socket, and no path there can carry that size.
  A single piece of feedback is a different shape of thing.
- **A `preferred: 'presigned'` flag instead of array order.** Rejected: it would be a second place
  saying the same thing, and the two could disagree. The cost is that the policy is terse — a
  reordering looks harmless in review, which is why the comment above the array says what a
  reordering does.
- **Add the upload service to the route table.** Rejected: the table pairs a destination with a
  signing strategy, and this service borrows the relay's. Injection keeps the two independent.
- **Trust `contentType` as the "this message has attachments" marker.** Rejected — see Decision 1.
  It is the cheap read, it tests green, and it is wrong in production.
- **Validate at each render site rather than in the parser.** Rejected: it is a trust boundary, and a
  boundary enforced in n places is enforced in n − 1 places by the next release.
- **Hold this layer until a screen uses it.** Rejected, but not without cost — see below.

## Consequences

### What is gained

- [ADR-0082](./0082-desktop-message-images-client-side-seam.md)'s seam now has something behind it.
  The remaining work on that surface is the change it predicted: point the reader at a parsed
  manifest and turn the send rejection into an upload.
- A second client (the mobile composer) inherits the accept rules, the parser, the trust boundary
  and the transfer policy without re-deciding any of them.
- The transfer method can change server-side without a client release, because both sides implement
  the contract's own interface.

### Trade-offs accepted

- **This ships as a layer with no caller.** It is inert and isolated to new files plus three barrel
  lines, but it is dead code until a screen lands — a fair thing to weigh against merging it early,
  and it is recorded here rather than argued away.
- **A client that does not parse the manifest shows raw JSON.** Any surface reading `content`
  directly has to go through the summarizing reader, and an older build, or another client, will not.
  This is the visible price of Decision 1 and it ends when the server field arrives.
- **Two scenarios are prepared for, not implemented.** A transfer can outlive its url, so a failure
  carries enough to tell "ask for another instruction" from "the bytes are wrong". And a background
  transfer can outlive the page that started it, leaving bytes stored and a slot unconfirmed — the
  settle-later operation exists and is idempotent by contract, but _where the record is written down_
  belongs to whichever shell can be interrupted, and no shell does it yet.
- **Inline transfers report no progress.** Their bytes go through the signed HTTP client, whose
  request surface deliberately exposes no transport config, so there is nothing to attach a progress
  handler to. The engine treats an unreported file as indeterminate and the UI shows a spinner.
  Presigned transfers, on raw XHR, report real progress.
- **Cancellation is batch-scoped, not per file.** The contract's executor signature takes no signal,
  so the only seam that does not bend it is the raw-PUT instance. "Stop sending these" is the action
  a person takes anyway; "stop file three" would need a contract change.

### When to reverse

Decisions 2, 3 and 4 are local — an executor set, a gateway, a parser — and each is reversible where
it lives. Decision 1 is the one with a defined end: when the server grows an attachment field, the
reader gains a branch that prefers it, `buildChatUploadsContent` stops being called on send, and the
manifest path stays only as long as unmigrated messages exist in history. Nothing above the reader
has to be found and rewritten, which is the whole reason it was written this way.
