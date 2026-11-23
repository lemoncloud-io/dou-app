# domain — models, mappers and the rules both apps share

> Canonical code: [src/domain/](../../src/domain/) · The facade that uses these is in [repositories](../repositories/README.md) · The cache that stores them is in [local](../local/README.md)

`domain/` holds the shapes the apps read (`Domain*` models), the one-way view-to-domain mappers, and
small pure predicates that web and desktop must answer identically. They live here, not in an app,
because the local data source, the repositories and both apps ask the same questions of the same row.

## Mappers

- **View → domain happens once**, in `mappers.ts`; repositories and local data sources consume domain models without mapping again. A mapper's input may already carry domain-only fields (re-read cache rows), so those are optional reads.
- **A channel's `lastChat$` is not read.** The last message, and so when a room last moved, belongs to the chat cache; folding a server summary into the channel would give one channel two answers.
- **A join's read cursor falls back to the view's `chatNo`**, because `JoinView` carries no `readNo`; without it every server-mapped join reported 0.
- **A user record's embedded `$join` is read, not carried.** A user is global (one row per user, `channelIds` unioned across channels), so a per-channel cursor on it would be wrong for every other channel; the cursor goes to the join cache.
- **A place member's picture arrives as `photo` and is moved to `thumbnail`**, the field every surface reads; the place profile, when there is one, lives in the profile cache and wins over these.
- **A channel's place** is its top-level `sid`, then `$.sid`, then the context's. A cloud 1:1 never takes the context's: it belongs to the place the server stamped on it, which its id names when the answer carries no field (`isCloudDm`, [domains.md](../repositories/domains.md#channel)). `#` is the server's "no place" and reads as empty.

## What a chat row is

All of these are in `chatPreview.ts`; each exists because a wrong answer shows as a visible bug.

- **Order by `chatNo`, with 0 last.** An unsent row carries `chatNo: 0`, so `compareByChatNo` treats 0 (or none) as newest and a just-sent message sorts to the bottom; `createdAt` breaks ties so several pending rows keep their send order. "Newest" always means this order, never the raw number.
- **System rows are not messages.** Everything the server generates itself (join, leave, reaction events) arrives with `stereo: 'system'`. The test is on `stereo`, not on individual `subType`s, because the server adds subtypes before a build knows them. `isNotifiableChat` is that test and is what push and unread use, so "what counts" has one definition. A system row whose `ownerId` is the viewer (`isOwnSystemChat`: "you joined") tells that user nothing and is hidden in lists; on a system row `ownerId` is the actor, not the room's owner, and an empty uid never matches.
- **Reaction toggles and revision notices (`subType` `reaction`, `edit`) are events about another message** (`isEventChat`). A reaction is folded into chips under its target; a notice only says which message changed (`edit$.chatId`) and the repository re-reads that message. Neither is drawn or counted, and one left in the feed would draw as an empty line.
- **The feed hides thread replies and events** (`isFeedVisible`); deleted messages stay, as a tombstone.
- **Preview and activity differ only by replies.** A room's one-line preview (`isPreviewableChat`) skips thread replies; the room's time and place in the list (`isActivityChat`) count them, so a reply moves the room up while the printed line stays on the last message the room shows. Failed sends count as neither. A system row is never previewed because it has no body and would leave a blank line.
- **`DomainLastChat.lastNo` counts every row type**, reactions and replies included, so a head-driven refresh can tell "the newest rows are not previewable" from "the cache is behind".

## Join window

Leaving and coming back must look like arriving for the first time. The server resets the join cursors on re-join and windows reads by `joinedNo`, so `isInJoinWindow` hides cached rows below it (`chatNo > joinedNo` is in). Two deliberate escapes: no `joinedNo` hides nothing (older join rows lack the field, and guessing would blank real history), and an unsent row (`chatNo` 0) is always inside.

## Editing and mentions

- **`canModifyMessage`** needs my own row that has a server id and is not pending, failed, system or deleted: edit and delete address the message by its server id, and a failed row is retried or discarded through the outbox instead.
- **`isMessageEdited`** is true when the server stamped `editedAt`; otherwise it falls back to `updatedAt` having moved past `createdAt`, the only signal from a cloud that does not record edits yet. A deleted (`hidden`) or pending row is never "edited": a message edited and then deleted keeps its `editedAt` but is a tombstone.
- **Mentions are what the composer picked, never parsed from the text.** The server does not read the body to decide who was mentioned (a typed `@name`, an e-mail address or a name that prefixes another would all be guessed wrong). The stored record keeps channel member ids, so `isMentioningViewer` takes every id the viewer is known by in that channel (the account uid and, in a subscription cloud, the cloud user id); checking the uid alone misses every mention there.
- **`all` arrives as `true` from a read and `1` from a live `chat.sync`**, and the server accepts only `true` on send, so `toMentionBody` converts it back. An optimistic row keeps its mention (`toMentionRecord`) because it is the only copy of a failed send, and a resend is rebuilt from it; without the record a retried message would mention no one.
- **The send payload widens the SDK's type** with `mention`, which the chats service already takes on `chat.send`. The input type comes from `-lib`, not `-api`: both export a `ChatSendInput` and only `-lib`'s carries `uploadIds`, so importing the other compiles and silently drops attachments.
- **A message that came through the webhook** (`stereo: 'webhook'`) is drawn as a card and its sender has no profile to open.

## Message text

`messageTokens.ts` splits text into the runs the bubble draws. It reads the desktop composer's dialect only (fences, `> ` quotes, inline code, labelled links, bold, italic, strike, bare URLs).

- **A fence closes at the next run of backticks at least as long**, so a block can contain a shorter fence. A fence's first line is its language tag only when it is a bare tag; otherwise it is code. A fence swallows the line break around it, since the block is its own box.
- **A quote line is `>` followed by a space (or nothing)**, so `>_<` and `>.<` stay text; the composer always writes `> `.
- **Links** are `http(s)` addresses that start with a host character; trailing sentence punctuation is dropped and a closing bracket is dropped only when unbalanced (`https://en.wikipedia.org/wiki/Foo_(bar)` keeps its `)`). `[x](javascript:…)` stays text.
- **Truncation.** For text the bubble cut short, a URL running to the very end may be a fragment and is left as plain text (a wrong page is worse than no link), and a fence left open is treated as closed, since its other half is past the cut. `extractFirstUrl` runs on the full message so a link the bubble cut still gets a preview card, and closes a dangling fence without distrusting a trailing URL; it must agree with the bubble on what is code.
- **Plain previews.** `toPlainPreview` (one line for the home list) drops markup, keeps words and collapses a fenced block to its first non-empty line, since pasted code often starts with a blank line; `toPlainText` keeps every line, for surfaces that search inside what they show. Where a block meets text with no whitespace left between them, a line break is put back.

## Attachments

`chatAttachments.ts` mirrors what the server accepts, so a picker can refuse a file before an upload starts instead of learning it from a 400, 413 or 415.

- **The declared type decides**, except when it says nothing (empty or `application/octet-stream`; a browser gives HWP an empty type) or names an Office container by the wrong type. DOCX, XLSX, PPTX and HWPX are ZIP containers whose type the browser takes from whichever app owns the extension: with no Office, or another suite holding it, they arrive as a ZIP, a legacy Office type or a vendor type the server does not know. In those cases the extension decides. Any other type is taken at its word, so a HEIC named `x.png` is refused rather than sent as a PNG.
- **Aliases go up under the canonical type**, because the server keeps none: Hancom's several HWP names, `application/x-zip-compressed` for ZIP (Chromium on Windows), and the M4A/MP3/WAV variants. A CSV that Windows types `application/vnd.ms-excel` is deliberately not aliased: the server refuses that pairing. AAC and WebM are not among the server's audio formats.
- **Audio is judged as a document** (`file`) when sending and stored by the server as `audio`; `chatAttachmentStoredKind` reports what it will become so a row does not flip from "File" to "Attachment" when the server has it.
- **The name is repaired, not trusted.** A video or document without its format's extension gets it appended (so a receiver never saves a file under a name that would run as something else); a name ending in another known format's extension is refused as disagreeing with the type. Images keep their name. The name limit is the server's, 255 bytes of UTF-8 measured **composed (NFC)**: macOS hands over Hangul decomposed at three times the bytes, and a too-long name is refused after the file is declared, so a retry can only fail the same way.
- **HTML is in the server's list but only desktop sends it** (the phone has no viewer), which is what the optional format filter is for.
- **The upload kinds are `image`, `video` and `file`**; an `upload$$` slot with no `stereo` is an image (every one was, before other kinds existed), and `audio` is passed through.
- **A video's size may be decided later.** An iOS video the shell has yet to convert is judged as the `mp4` it will become, and its size is judged after conversion, not before: a 4K HEVC clip runs near 170 MB a minute, so by the source size a clip under two minutes would be refused that converts to well under the limit.
- **Duplicate detection uses name + size + mtime**, not a content hash, which would read every picked file in full; it catches the same photo tapped twice. A shell file has no mtime, but each pick is copied to a fresh address.
- **The per-message limit is passed in** (`max`), so this module does not depend on the send sequence that owns the constant.

## Media and notification indexes

`chatMediaEntries` and `chatNotificationEntries` turn a row into index entries and are the only place that decision is made, so the in-memory view and a store beside the rows cannot disagree. Each has a rules `VERSION`; raise it whenever the function would answer differently for a row it already answered for, and rooms indexed under the old one are indexed again on next read ([room media index](../local/README.md#room-media-index)).

- Notification entries are reader-independent: they do not know who is reading, since the ids a reader is known by differ per cloud and per room and some are learnt after a row is cached. A reader's own mentions, replies and reactions are picked out later.
- They order by the server's sent time, not the cached `createdAtMs`, which falls back to the device clock and would order the same entries differently on two devices.
- A link entry reads the bubble's own tokenizer, so an address inside code is not a link.

## Pushes, webhooks, mini apps

- **A relay push's `cid` is `#`**, a payload marker, not a cloud id: no cache partition, socket slot or session is keyed by it, and `delegate-cloud` answers it with 404. `pushCloudIdOf` maps it to the relay's cloud id and an absent or empty `cid` (deployed backends often send `""`) to `undefined`; every reader of a push's source goes through it.
- **A webhook view is the management row, never the secret.** The token is returned once by `webhook.make-token` and lives only on the issue result, which no cache or store keeps. Epoch fields use 0 for "never" (expiry) and "never used"; the server stamps last use at most once a day.
- **A mini app's `status` is the relay's display value** (`held` while an admin holds it whatever the owner's switch, `inactive` when the owner turned it off, `active` otherwise). Branch on it, not on `enabled`.
