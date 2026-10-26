# share — what another app shared to Dou

`apps/web/src/app/features/share` is one page at `/share?id=<id>`. The phone app opens it after
another app shared photos, videos, documents, text or a link to Dou through the OS share sheet: the
shell has already copied the items into its own folder, and the page asks for them by the id in the
URL, lets the person choose where they go, and sends them.

**The page composes; the shell only receives.** Nothing in the iOS share extension or the Android share
intent picks a room or talks to a server — the session, the room lists and the sockets are all here, in
the web client. How the items reach the shell's folder is the shell's
[share-intake.md](../../../../mobile/docs/native/share-intake.md).

## Responsibilities

This feature decides **what the person sees between the share sheet and the room**: the shared items,
where they can be sent, and what happens when they leave. It owns nothing about how a file is uploaded
or a message is sent — that is the room's own send (`useSendImages`, the chat send), used unchanged —
and nothing about how the shell copies or keeps the items.

## The shared contract

### The id is all the URL carries

`/share?id=` holds a share id and nothing else. The page asks the shell for that share with
`FetchShareIntake` and reads the answer as one of four states:

| State     | When                                                                | What the page does                     |
| --------- | ------------------------------------------------------------------- | -------------------------------------- |
| `loading` | The shell is still answering — Android may still be copying a video | A preparing spinner, for up to 10 min  |
| `ready`   | The items, the refusals and any text                                | The composer                           |
| `empty`   | No id, an app without share intake, or a share it no longer holds  | Home, with a notice when an id was given |
| `error`   | A timeout or the bridge dropping                                    | A retry                                |

`NOT_FOUND`, `GONE` and `INVALID` all read as `empty`: the web ships before the app, so an app without
the handler is normal, and a share already released is simply over. Only a transient failure offers a
retry.

### Items are shell files until the send

Every item arrives as a shell file — the same `ShellFileRef` the documents picker gives — so nothing
crosses the bridge until the person sends. A photo's bytes are read then, one at a time, which is also
what gives it the resize and thumbnail any photo gets. The person can drop an item before sending; the
share in the shell is left as it was.

### Where it goes: the session's cloud and place

The composer offers the rooms home shows for the session's cloud and place — the place's rooms and
1:1s, and the cloud's notes-to-self — named and pictured by the same title and avatar rules, so a room
reads here as it does everywhere else. A room in another place or cloud is reached by changing the
**cloud** or **place** row, which runs the same switches the cloud sheet and the place list run (a cloud
change waits for the current socket's handshake first). A send rides the session's selected place, so
the rooms cannot span places; and moving either row drops every pick, because none of them belongs to
the new place. The relay (Dou home) has one place, chosen for the person, so it has no place row.

A switch that fails leaves the session where it was, and the picks with it.

The **To** list is searchable by room name and takes up to five rooms — each one is its own upload of
every file. Its picks are a draft until Done. It opens as a history entry of its own (`&to=1`), so the
system back closes it as Cancel does instead of leaving the share.

The preview names the items, as the documents picker's hold above the composer does; it does not draw
photo thumbnails. Drawing one means reading the photo across the bridge before the person has decided
anything, which is the cost that hold exists to avoid.

### What is sent

- The items are judged as a room's attachment pick is (`judgeChatAttachments`): the server's formats,
  each kind's size limit, ten per message. What does not pass — and what the shell refused to copy —
  is named under the preview before anything is sent; the rest is what goes.
- The message and the shared text go together as the caption, message first. With no items, they go
  as a plain message.
- Photos are read into the page at the send, once for every room, the way a documents-picker photo is
  (`attachmentPicker.readPhotos`) — so they are resized and given a thumbnail rather than going up raw.
  A photo that cannot be read is named and left out; a read that fails outright sends nothing and keeps
  the composer, so the person can try again.

### One send per room, started and left

Each picked room mounts the room's own attachment send (`useSendImages`, bound to that room) while it
is picked. Send starts every room's send and leaves at once — a file send resolves only when its uploads
finish, which can take minutes, and it carries on after the page is gone. One room failing does not
stop another; a failure lands as that room's failed row. A file send that fails before any row is
written leaves nothing in the room, so the page says so with a notice instead. Every picked room must
have its send mounted before anything is read — otherwise nothing is sent and the composer stays. Like any send whose screen was left before it
settled, that row can be deleted but not retried: the runtime lets go of the files of a send nobody is
attached to once it fails, rather than holding them for a screen that may never come back. After one
room the page opens it; after several it says how many and goes home.

### Leaving

Closing the page releases the share with `discard`, and the shell deletes its copies. Sending releases
it without, because the uploads just started are still reading those files; they stay until the
`attach-pick` sweep — which runs at the next pick — finds the folder a day old. Close is disabled while the photos are being read, since discarding then would take
the files out from under the send.

### Reaching into `channels`

The room send, the title and avatar rules, the 1:1 peer lookup and the room-kind rules live in
`features/channels`, and this feature imports them as home and search do rather than keeping a copy that
could drift. Moving them to `app/` is the placement check's own refactor (see the web docs' import
check), not something a share should do on the side.

## Further reading

- [share-intake.md](../../../../mobile/docs/native/share-intake.md) — the shell's side: the copies, the
  id rule and the release.
- [channels](../channels/README.md) — the room send this page hands the items to.
