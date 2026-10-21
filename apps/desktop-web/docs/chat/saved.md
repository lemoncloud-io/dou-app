# Saved items

Save for later, in a message's "More" menu, keeps that message on this device. The backend has no
bookmark model, so nothing follows the account to another device, and the page says so. The items
live in `useSavedItemsStore` (`shared/stores/`), persisted to localStorage.

## What an item keeps

An item is a snapshot taken when the message is saved, not a pointer to it: the source row can page out
of the chat cache, and the page must still draw it. It keeps the message's text (or, for a message
with no text, what it carries — "Photo", "3 files"), its author's name and picture, its channel, place
and thread root, when it was sent, and what it carried: the attachments' kind and count, and the first
one's name and size (`savedAttachmentOf`). Items saved before a field was kept simply lack it, and the
card leaves that part out.

## The page

Saved is the first row of the Home sidebar. It opens `SavedPage` in the main pane, in place of the
conversation, and the row stays marked while it is there.

- The title counts every saved item. The cards are newest first, from every place of the cloud; one
  saved in another place names that place after its channel.
- **All · Messages · Files** filter the cards. A message saved with any attachment is a file — a photo
  with a caption included — and the rest are messages. The filters are off while nothing is saved.
- A card leads with where the message came from: a thread (it has a root), a 1:1 (its room is one, in
  this place's list), or a channel, with the channel's name when this place lists it. Then the author,
  the time it was sent, the text, and a tile for its first file.
- A file-only message's text is only the line it was saved with ("Photo"), so the tile stands in for it.

## Leaving it

Opening a card jumps to the message, or opens its thread, through `HomePage`'s `jumpToSaved`, the same
open the inbox uses ([jump-and-return.md](./jump-and-return.md)). That open closes the page, not the
card, so a click refused while a place switch runs leaves the page in place. Every other way into a
conversation closes it too: picking a room from a list, a search hit, an OS notification (the room
already open included), a new selection, and a cloud switch, whose items are another cloud's. The
card last opened stays marked when the page opens again.

The bookmark on a card unsaves it, as the message's own menu does.

Opening the page closes a thread or settings pane: they belong to the conversation it replaced
([trailing-panels.md](../shell/trailing-panels.md)).
