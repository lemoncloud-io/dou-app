# Share intake

What another app shares to Dou through the OS share sheet. The shell receives it and nothing more: it
copies the shared items into its own `attach-pick` folder, keeps any shared text beside them, and
opens the app on `<scheme>://share?id=<id>`. The web's share page asks for the items by that id, lets
the person pick where they go, and sends them as it sends a pick from the documents picker.

The destination list and the send are not here, and cannot be. The session tokens, the cached clouds,
places and rooms, and the sockets a send rides all live in the WebView; a share sheet that picked a
room by itself would need a second copy of each, in Swift and again in Kotlin.

## Files

| Layer             | File                                                     |
| ----------------- | -------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/share-intake.ts`      |
| WebView handler   | `src/app/webview/hooks/shareIntakeHandlers.ts`, `useShareIntakeHandler.ts` |
| TS native wrapper | `src/app/bridge/ShareIntakeBridge.ts`                    |

## Messages

| Request              | Reply                  | What it does                                                                         |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `FetchShareIntake`   | `OnFetchShareIntake`   | The share's items, refusals and text, by id; waits while Android is still copying    |
| `ReleaseShareIntake` | `OnReleaseShareIntake` | Forgets the share; with `discard`, deletes the copies too                            |

An item has the shape the documents picker answers with: a `file`, or a `video` that may still need
`PrepareVideo`. A photo is a `file` too, and the web reads its bytes with `ReadAttachment` at the send,
so a shared photo is resized and given a thumbnail like any other. Because the copies live in
`attach-pick/<id>/`, the upload's allowed roots, the video conversion and the day-old sweep take them
with no change of their own.

## The id is the only thing the web sends

The handler accepts an id only in the one shape the native side makes, a UUID, and refuses anything
else as `INVALID` before native code builds a folder path from it. The web is remote content; `../`
must never reach the file system.

Failures keep their meaning for the web: `GONE` for a share the shell no longer holds (released, or the
OS cleared the cache), `INVALID` for a malformed id, `INTERNAL` for the rest. Never `NOT_FOUND` — the
web reads that as "this app has no share intake" and stops asking.

## Release

Cancelling on the share page releases with `discard`, which deletes the copies at once. A send releases
without it: the uploads that were just started are still reading the files. The `attach-pick` sweep
removes the folder later — it runs before the next pick, and takes folders untouched for a day. A
release for an id the shell does not hold succeeds — it already happened.

## Logging

The handler logs counts only — how many items, how many refused, whether there was text. What someone
shares can say more about them than a log should hold.
