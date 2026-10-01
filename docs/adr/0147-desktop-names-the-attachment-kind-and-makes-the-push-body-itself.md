# ADR-0147: Desktop names the attachment kind, and makes a push's body itself

> Status: Accepted · Decided: 2026-09-30
> · Scope: `libs/data/src/domain/chatImages.ts` (`chatAttachmentSummary`)
> · `apps/desktop-web/src/app/shared/utils/messagePreview.ts` · `apps/desktop-web/src/app/shared/utils/pushBody.ts`
> · `apps/desktop-web/src/app/shared/hooks/useCrossCloudPushNotifications.ts`
> · The module doc is [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md)

## Context

The server now stores videos and documents beside images, and marks each upload in a message's
`upload$$` with a `stereo`: `image`, `video`, `audio` or `file`. Desktop read every attachment as a
photo. The sidebar row and the same-cloud OS banner counted `upload$$` and said "Photo" or
"3 photos", so a PDF was a photo.

A push from another cloud had a second problem. The server's chat push carries a body key and its
arguments (`loc_key`, `loc_args`), and the Electron shell makes the banner body from the first
argument, which for a text message is the text. The push contract adds one key per attachment kind
for a message with no text, singular and plural, and a plural key's only argument is the count. On
desktop that banner would read "3". Until the server switches to those keys, an attachment-only
message is pushed as the text key with no argument, and the banner body is empty.

The installed contract types (`lemon-model` 1.5.0) name the kinds `image | video | sound | docs`.
The server publishes 1.5.1 and sends `audio` and `file`.

## Decision

**One rule names the kind, and every desktop surface that previews a message uses it.**

- `chatAttachmentSummary(chat)` in `@chatic/data` returns `{ kind, count }`: the kind when every
  attachment is the same image, video or file, else `mixed`, with the count `chatImageCount` gives.
  A slot without `stereo` is an image: a slot still being sent has none, and every message from
  before other kinds existed was an image message. It lives in `libs/data` so the phone and mobile
  web can read the same rule.
- `stereo` is read as a plain string, matched against the names the server sends. The installed
  types would reject `'file'`, and a check for `'docs'` would never match live data.
- The sidebar, the same-cloud banner and the cross-cloud push all go through one label function:
  "Photo", "Video", "File", "Attachment", or their counts.
- **The renderer makes the cross-cloud body.** `presentPush` maps an attachment `loc_key` to the
  same label, reading the count from `loc_args` as FCM's JSON string or as an array. A text push
  with no text, and a plural key whose count cannot be read, show "New message". Any other push
  keeps the shell's body.

## Consequences

- **Desktop does not use the push contract's sentences.** The push keys are sentences ("Sent 3
  photos") written for a phone banner. Desktop shows the sidebar's nouns, because its same-cloud
  banner already prefixes the sender ("Raine: 3 photos"), and one wording across both paths beats
  matching the phone.
- **The renderer mirrors the server's key list.** A new attachment key needs a row in `pushBody.ts`
  as well as the server change. Until then the push falls through to the shell's body.
- **A mixed set shows no kinds.** Two photos and a PDF read "3 attachments", as the server's own
  choice of key does.

## Alternatives

- **Translate `loc_key` in the Electron shell** (`apps/desktop/src/main/fcm.ts`). Rejected: the main
  process only forwards pushes, and the renderer owns presentation and the locale files. Copy in
  the shell would be a second set of strings.
- **Bump `lemon-model` to 1.5.1 for the types.** Deferred: it changes the lockfile for a string
  comparison. Sending video and files from desktop needs the newer SDK anyway, and brings the bump.
- **Count attachments as photos until desktop can send other kinds.** Rejected: once the server
  accepts other kinds, any upload that reaches a room is counted as a photo whoever sent it.
