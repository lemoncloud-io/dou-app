# ADR-0317: The room plays audio through one player, computes waveforms on the device, and hides files locally

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/mobile-voice-file-design`
> · Scope: `apps/web/src/app/features/channels/` (`stores/roomAudioStore.ts`, `components/RoomAudioHost.tsx`,
> `components/MessageAudioBubble.tsx`, `pages/AudioDetailPage.tsx`, `pages/RoomFilesPage.tsx`,
> `lib/audioWaveform.ts`, `lib/localMediaPrefs.ts`), `libs/web-ui-kit` (the audio and room-file components),
> `libs/data/src/repositories/ChatRepository.ts` and `libs/runtime-core/src/bridge/repositories.ts`
> (`listRoomMedia`, `countRoomMedia` handed through)
> · Amends: [ADR-0270](./0270-the-phone-sends-records-and-plays-audio-and-the-shell-records-it.md) — decision 4
> (a player card with its own `<audio>` and a ⋯ menu) and its "no waveform" consequence
> · The behaviour is documented in [audio-files.md](../../apps/web/docs/feature/channels/audio-files.md) and
> [room-files.md](../../apps/web/docs/feature/channels/room-files.md)

## Context

The phone's audio files were redrawn to a new design: an audio bubble with a seek bar and a speed, a mini
player when the bubble scrolls away, a full-screen detail with a waveform, a room file list with a
selection mode, and "delete" on files. Three parts of that design lean on things the app did not have,
and the server was not to change for it: it keeps no waveform, no list of a room's files, and no way to
remove a file from a message for one person only.

ADR-0270 gave each audio card its own `<audio>`. A card's element goes away with its row — a shrunk message
window, a thread opened over the room — and with it the position; the bubble, the mini player and the
detail could not agree where the same file was.

## Decision

1. **One player for the room's screens.** A single `<audio>` is mounted above the room, thread, audio
   detail and file list routes (`RoomAudioHost`); every surface shows the player's state for its file and
   asks it to play, pause, seek or change speed. One file plays at a time, one speed applies to all,
   positions are kept per file, and leaving the channel stops it. Saving and sharing move from the card's
   ⋯ menu to the message's long-press sheet.
2. **The waveform is computed on the device, under limits.** The detail fetches the file once more,
   decodes it at 8 kHz mono and keeps only 48 bar heights per upload (at most 500 uploads per account).
   Nothing over 20 MB or 15 minutes is decoded; a decorative shape is drawn instead, and for a file that
   cannot be decoded.
3. **"Delete" in the room file list hides on this device only.** The hidden entries are kept in the page's
   device store, per cloud and account, keyed by message number and slot — never as a mark on the cached
   message, which a server page overwrites. The conversation leaves them out on this device too. The
   long-press delete stays what it was: the server delete, for everyone, of my own message.
4. **The room's media is read through the repository.** The media index's two queries are handed through
   `IChatRepository` and the mirror bridge's method table unchanged, so a page reaches them where the shell
   owns the session; a shell built before them answers `RUNTIME_NOT_AVAILABLE`, and the room file list's
   entry point is then not drawn.

## Alternatives

- **Keep one element per bubble and share positions in a store.** Two elements could still play over each
  other, and a mounted detail screen would need a third; the store would be copying what one element knows.
- **A server waveform.** Right for every client, but a contract change for an upload model the server owns,
  outside this work.
- **Decode at the file's own rate, or with no limit.** A 15-minute file decoded at 48 kHz is several hundred
  megabytes of samples; at 8 kHz it is about 29 MB.
- **Hide in the message cache, or in a new IndexedDB store.** A cache mark is lost on the next server page;
  a new store means a `libs/db` schema change and does nothing for the phone shell, whose cache is SQLite.
- **Offer forwarding, expiry and message links from the design.** The server attaches only the sender's own
  upload to a new message, keeps no retention period and has no message links; none is drawn.

## Consequences

- **Playing a file costs one download, its waveform a second.** Bounded by the 20 MB limit; nothing
  restricts it on a cellular connection.
- **Memory was measured, not assumed** (2026-11-16, synthetic AAC 128 kbps): a 15-minute file peaked at
  about 92 MB in iOS WebKit's content process (simulator) and about 650 MB of renderer RSS in Chromium on a
  2.5 GB Android emulator, with no low-memory kill; 35- and 72-minute files made Android's low-memory killer
  close background apps. Chromium decodes at the file's own rate before resampling, which is why the limits
  matter more there. Real phones were not measured.
- **Hiding is per device.** Another phone of mine still shows the file, and clearing the app's data shows it
  again. A hidden message of mine cannot later be deleted for everyone from the conversation until it is
  shown again.
- **The file list is this device's view.** Its counts are what this device has cached, and "Find older
  files" widens the cache one server page at a time.
- **A shell that owns the session needs a new build for the file list.** Until then its entry point is not
  drawn; a browser and a shell that does not own the session get it with the web deploy.
