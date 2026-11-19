# room files — photos·videos, files, audio and links shared in a room

`/channels/:channelId/files?tab=media|file|audio|link` (`pages/RoomFilesPage.tsx`), reached from the
"Room files" area at the top of the room settings (`RoomFilesEntry`) and from the audio detail's header.
The design drew the audio tab (Figma `6067:22415`, selection `6083:*`); the other three tabs reuse pieces
the app already has — a three-column grid with the media viewer, and the audio tab's rows for files and
links.

## Where the list comes from

**This device's message cache, not the server** — the server has no list of a room's attachments. The
media index (`chat.listRoomMedia` / `chat.countRoomMedia`, see
[libs/data docs/local § Room media index](../../../../../libs/data/docs/local/README.md#room-media-index))
answers per kind, newest first, an attachment or a link per entry. The screen reads it through the same
repository graph the room reads its messages from (`runtime.data.useRuntimeRepositories`): that is the
cache partition the room's rows — and their index entries — were written to.

So the list is "what this device has seen". At its end, when the cache has nothing older of the tab's
kinds, **Find older files** asks the server for the room's next older page (`refreshList`, the room's own
page size) — the rows it brings are indexed as they are written — and reads on from where each kind
stopped. Once the server says there is no more (`cursorNo === 0`) the button goes. A tab that opens empty
looks once on its own. The numbers on the tabs and on the settings area are the index's counts: what this
device found, not the room's total. A new device shows few at first.

- The photos·videos tab reads `image` and `video` together and merges them, stopping where a kind with
  more pages could still have an item above the last one shown (`mergeNewestFirst`).
- Rows are grouped by the month they were sent. Search (the header button) looks in the loaded rows'
  names and senders, a link's address.
- A row whose message no longer has that attachment is dropped; unsent and failed messages have no
  entries at all.
- The tab is read again whenever the room's newest window changes in the cache.
- **Where the shell owns the session and was built before these two reads, they answer
  `RUNTIME_NOT_AVAILABLE`** (see [libs/runtime-core docs/bridge](../../../../../libs/runtime-core/docs/bridge/README.md)):
  the settings area is then not drawn at all. A missing feature reads better than an empty list.

## Rows

- **Audio**: play button (the room's player, see [audio-files.md](./audio-files.md)), the name, `sender ·
date · length · size` — the length once the file was played on this device — and, while it plays, the
  seek bar. The name opens the detail.
- **Files**: the file mark, the name, `sender · date · size`; pressing opens it as the document card
  does — in a browser a PDF opens in the document viewer ([image-send.md](./image-send.md#the-document-viewer-browser)).
- **Links**: the address and `sender · date`; pressing opens it.
- **Photos·videos**: a three-column grid; a tile opens the media viewer over the loaded items.

Senders are named the way the room's rows name them (`useRoomSenderName`). Each row's ⋮ opens a sheet with
its name and details: Details (audio), View in chat, Save (or Copy link), Share, Delete.

## Selecting

"Select" in the header, or a long press on a row. The tabs dim and do not switch; what plays keeps playing.
The bar offers Save · Share · Delete — Copy link · Share · Delete on the links tab:

- nothing selected: everything off;
- **save and share act on up to ten at once** — past ten only delete stays on, with a notice;
- **share takes one file**: the app's share sheet (`ShareFile`) carries a single file, so share is on only
  with exactly one selected. A link is shared through the page's `navigator.share` where there is one;
- save reports once for the whole selection (`useFileDownloads.saveAll`, the viewer's save-all for photos
  and videos), with a retry of what failed. In a browser tab each item is a browser download in turn, and
  one toast says when any could not be saved, with no retry
  ([image-export.md § In a browser tab](./image-export.md#in-a-browser-tab)). Share in a browser reaches
  a photo or video only where the browser shares files, and never a document: there it does nothing.

## Delete hides, on this device only

Nothing here can remove a file for the others, so "delete" hides it on this device: the confirm says so,
and a toast offers Undo for four seconds. The hidden keys are `<channelId>:<chatNo>:<idx>` — the media
index's own identity of an entry — kept per cloud and account in the page's device store
(`lib/localMediaPrefs.ts`, `localStorage` through `deviceStore`), never as a mark on the cached message:
a page from the server rewrites the row and would drop it. Clearing the message cache does not lose them;
clearing the app's data does.

A hidden item also leaves the conversation on this device (`ChannelMessageRow` `hiddenMedia`): a photo
leaves its grid, a file or audio its card, a link its preview card; the text stays, and a message left
with nothing to show is not drawn. If it was playing, it stops. The long press's Delete is a different
thing — the server delete, for everyone, of a message of mine.

## Verifying

- Unit: `hooks/useRoomFiles.test.ts`, `pages/RoomFilesPage.test.tsx`, `components/RoomFilesEntry.test.tsx`,
  `utils/roomFiles.test.ts`, `lib/localMediaPrefs.test.ts`, `components/ChannelMessageRow.test.tsx`.
- By hand: send audio and a photo in a room, open settings → Room files; play from the audio tab; select
  and delete one, undo, delete again and check it is gone from the conversation too.
