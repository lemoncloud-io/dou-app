# ADR-0159: A message's photos and videos share one tile list and one media viewer

> Status: Accepted · Decided: 2026-10-01
> · Scope: `libs/data/src/domain/chatMedia.ts` · `libs/web-ui-kit/src/composites/{chat/MessageMediaTiles,chat/MessageFileCard,overlay/MediaViewer}.tsx` ·
> `apps/web/src/app/features/channels/{components/MessageImages.tsx,hooks/useFileDownloads.tsx,hooks/useImageExports.tsx,lib/fileExport.ts,lib/imageExport.ts}` ·
> `apps/web/src/app/bridge/shellCapabilities.ts`
> · The module docs are [apps/web image-send.md](../../apps/web/docs/feature/channels/image-send.md) and
> [apps/web image-export.md](../../apps/web/docs/feature/channels/image-export.md)
> · Related: [ADR-0155 (the viewer offers save and share when the handshake lists both)](./0155-the-viewer-offers-save-and-share-when-the-handshake-lists-both.md)
> (extended here to videos) · [ADR-0158 (mobile picks videos and documents in the shell)](./0158-mobile-picks-videos-and-documents-in-the-shell-and-uploads-them-from-its-folder.md)
> (the sending side)

## Context

A chat message can now carry photos, videos and documents together, up to ten. Until now the mobile
web drew every upload as a photo tile and opened it in a photo viewer. A video drawn that way is a
broken image, and a document has nothing to show at all.

Inside the app the page cannot keep a file either: the WebView ignores `<a download>`, and following a
signed address leaves the app's screen. The shell already downloads into a folder of its own and hands
only those files to the photo library or the share sheet (ADR-0152), and the viewer's photo save and
share run that way (ADR-0155).

## Decision

**Photos and videos are one list of media, in the order they were sent: one tile grid in the row, one
viewer to page through them. Documents are cards below the media, and the shell opens and saves them.**

- **`chatMediaItems` splits a message's uploads** into media (photos and videos) and files (documents),
  each keeping its position among the uploads. The viewer and the tiles know items and kinds, never the
  message.
- **A video plays in the viewer and only there.** The feed draws its poster with a play mark; no
  `<video>` sits in the feed, where every video would start a request just by scrolling past. The
  viewer plays it with the OS player, tries to start it within the tile tap, and detaches its address
  when the page turns away so the download stops.
- **Save and share cover videos with the photos' rule** — the handshake lists both messages — plus a
  second, learned one: an older app refuses a video's bytes with `UNSUPPORTED_TYPE`, and the page hides
  video buttons for the session. "Save all" counts the photos and videos that can be saved now, and
  saves them one at a time.
- **A document card downloads through the shell inside the app** and then `SaveFile` keeps it on the
  device or `OpenFile` shows it in the OS preview; a preview nobody can show falls back to the share
  sheet. An app without those messages answers `NOT_FOUND`, and the card says an update is needed. In a
  browser the card fetches the file and saves it under its own name.

## Consequences

- **One viewer, two kinds of page.** Zoom belongs to photos only, and the bottom of a video page belongs
  to the player's seek bar, so the viewer's drag rules depend on the item.
- **A video is never cached or fetched ahead.** The player streams with range requests from the signed
  address; turning back to a video downloads its first megabytes again.
- **Learning video support costs one failed attempt** on an older app: the first save or share of a
  video ends with an update notice, and only then do the buttons go.
- **A downloaded document is remembered for the page's life only.** After a reload the card downloads
  again on the next press.
- **A browser download holds the whole document in memory** as a blob — up to the 50 MB document limit,
  the same cost desktop accepted (ADR-0148).

## Alternatives

- **Separate tile lists and viewers for photos and videos.** Rejected: the message's order is the
  sender's, and splitting it would page the person through two viewers for one message.
- **Play videos in the feed.** Rejected: autoplay or even `preload` in a scrolling list starts downloads
  of up to 300 MB per video the person never opened.
- **Decide video save support from the handshake.** Rejected: the handshake lists the messages, not
  which formats an older app's handlers accept; widening the message did not add a new name to list.
- **Open a document at its signed address.** Rejected: inside the app it leaves the app's screen, and
  the address expires.
