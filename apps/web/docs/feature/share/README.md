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

### Leaving

Closing the page releases the share with `discard`, and the shell deletes its copies. Sending releases
it without, because the uploads just started are still reading those files.

## Further reading

- [share-intake.md](../../../../mobile/docs/native/share-intake.md) — the shell's side: the copies, the
  id rule and the release.
- [channels](../channels/README.md) — the room send this page hands the items to.
