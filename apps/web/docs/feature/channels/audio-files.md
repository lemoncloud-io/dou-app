# audio files — the bubble, the room's player, the mini player and the detail screen

An audio upload — a recorded voice message or an audio file someone picked — is drawn as an audio
bubble in the conversation and played by **one player the room's screens share**. Around it: a mini
player when the bubble scrolls away, a full-screen detail with a waveform computed on this device, a
send sheet that confirms audio before it goes, and the long-press rows that save and share it. The
design is Figma `ViwLfjc5Eoq7BpEXFfFj3W` (components `6092:23802`, screens under `6098:32803`).

What this document does not cover: picking, uploading and retrying ([image-send.md](./image-send.md)),
the recording sheet ([image-send.md § Voice messages](./image-send.md#voice-messages)), and the room's
file list ([room-files.md](./room-files.md)).

## The room's player — `stores/roomAudioStore.ts`

One `<audio>` element, owned by `RoomAudioHost`, which `ChannelRoutes` mounts **above** the routes. The
room, a thread, the audio detail and the file list are all inside it, so moving between them never
interrupts what plays; the bubble, the mini player, the detail and a file-list row only show the store's
state for their file and ask it to play, pause, seek or change speed.

Why one element and not one per bubble: a bubble's element went away with its row — a shrunk message
window, a thread opened over the room — and with it the position, and two surfaces showing the same
file could not agree where it was.

- **One sound at a time.** Playing another file pauses the first and keeps its position
  (`positions`); pressing the first again resumes there. Anything else in the page starting to play —
  the media viewer's video — pauses the player, and the player starting pauses everything else (one
  capture-phase `play` listener). A recording about to start pauses it (`pauseInlineAudio`, kept under
  its old name for the recording sheet).
- **One speed for every file**, cycled `1x → 1.5x → 2x → 1x`, applied at once to what plays and kept for
  the next file. It is not stored across reloads.
- **Leaving the channel stops it** — another room, or any path that is not one of this channel's
  screens (`channelOfPath`) — and forgets every position. Closing the mini player stops and unloads but
  keeps positions.
- **A deleted message or a hidden file stops it** (`useRoomAudioSurface`): nothing is left on screen to
  pause it from.
- **A file that fails** is read again once (`getChat`) for a fresh signed address and plays on from
  where it was; a second failure means this system cannot decode it (iOS has no Ogg Vorbis): a toast,
  and the file is marked unplayable everywhere.
- **`play` runs inside the tap.** The WebView lets only a gesture start sound.

The length of a file is unknown until its header was read, which is the first play — the upload carries
none, and reading every bubble's header would be a request per bubble on a long conversation. Before
that a bubble shows the size alone.

## The bubble — `components/MessageAudioBubble.tsx`

`MessageImages` draws every audio upload as `AudioMessageBubble` (`@chatic/web-ui-kit`), in every state:

| State          | When                                                                         | What it shows                                                       |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| on its way     | the slot is `sending`                                                        | a progress ring with ✕ (deletes the unsent row), `12.0MB / 48.0MB`  |
| failed         | the message or slot failed                                                   | a red mark, "failed to send", and Retry · Delete chips below        |
| broken         | the server slot failed or has no address                                     | the waveform mark, "can't play this file"                           |
| unsupported    | the platform's player says it cannot play the type, or playback failed twice | the waveform mark, "unsupported format · 17.0MB", a download button |
| idle           | sent and not started                                                         | play, the name, `length · size` (or the size alone)                 |
| playing/paused | the player holds it, or left it mid-way                                      | the seek bar, `elapsed / length`, the speed chip                    |

"Unsupported" is asked of the platform (`canPlayAudioType` → `HTMLMediaElement.canPlayType`), so iOS and a
browser answer for themselves. A recording made in the app is named "Voice message": nothing marks one
except the shell's name for it, `voice-<yyyyMMdd-HHmmss>.m4a` (`isVoiceMessageName`).

Pressing the bubble outside its controls opens the detail. A long press is the row's, as for any
message. A failed audio-only message draws its failure on the bubble only — the row's own retry and ✕
are left out so it is not said twice. The old card's ⋯ menu is gone: saving and sharing are the
long-press sheet's rows, between thread and delete (`MessageActionSheet`, `audioFileOf`).

## The mini player — `components/RoomMiniPlayer.tsx`

Under the header, in the room and in a thread, while a file plays — or is paused mid-way — and its
bubble is not on screen. Whether it is on screen is asked of an `IntersectionObserver` on the list; a
bubble not drawn at all (an older window, another surface) counts as off screen. Its body jumps back to
the message the way a search result does (`useMessageJumpStore`); a reply's file is in its thread, so
from the room that opens the thread first. × stops.

## The detail — `pages/AudioDetailPage.tsx`

`/channels/:channelId/audio/:chatNo/:idx` — the message number and the upload's slot. The message is read
from the room's cache, then from the server for fresh addresses and a delete the cache missed
(`useChatMessage`). The header names the sender the way the room's rows do (`useRoomSenderName`) and its
sent time jumps to the message; the right button opens the file list's audio tab.

Below: the waveform, the name and `length · size`, the seek bar with elapsed and remaining time, the speed
chip, 15 seconds back · play · 15 seconds forward, and Save · Share · More. More offers View in chat,
Reply in thread and — on my own message — Delete (for everyone, as the long press does). A message
deleted since loses View in chat and the sent-time jump. "Forward to DoU" and "Copy link" from the design
are not here: the server will not attach another member's upload to a new message, and messages have no
links.

### The waveform — `lib/audioWaveform.ts`, `hooks/useAudioWaveform.ts`

The server stores no waveform, so the detail computes one: the file is fetched once more, decoded at
**8 kHz mono** (`OfflineAudioContext(1, …, 8000).decodeAudioData`) and cut into 48 RMS bars, scaled so
the loudest is 1. Only the bars are kept (`localMediaPrefs`, per cloud and account, the 500 most recently
used); the bytes and the decoded buffer are dropped. Until the bars exist — and for good when they cannot
be computed — a decorative shape seeded by the upload id is drawn, the same shape every time.

Not attempted, and remembered as decorative so it is not tried again:

- **over 20 MB, or over 15 minutes** — checked before downloading when the size or the length is known,
  and against the decoded length otherwise;
- **a failed download, or a format the platform cannot decode.**

Leaving the screen aborts and keeps nothing. Why the limits are where they are: measured on 2026-11-16,
a 15-minute AAC file peaked at about 92 MB in iOS WebKit's content process and about 650 MB in a
Chromium renderer on Android (Chromium decodes at the file's own rate before resampling). Inside the
limits no low-memory kill was seen on a 2.5 GB emulator; a 35- or 72-minute file made Android's
low-memory killer close background apps. The extra download is bounded by the same 20 MB.

## Sending audio — the send sheet

Picking only audio through the files entry, with nothing already waiting above the composer, opens a
sheet (`AudioSendSheet`) instead of the waiting-files strip: one row per file with `length · size` — the
length read from a page `File`'s header; a file the shell keeps shows its size alone — × to drop one,
and Cancel / "Send n". Dropping the last closes it. It sends one message, as the strip's send would.
Audio picked together with anything else waits in the strip as before.

When a pick with audio in it has refused files, a dialog (`UnsendableFilesDialog`) lists each with its
reason — the usual refusal texts, plus "empty file" for a zero-byte one — and offers "Send the other n",
or a single OK when nothing is left. Every other pick keeps the one-toast rule.

## Verifying

- Unit: `stores/roomAudioStore.test.ts`, `components/RoomAudioHost.test.tsx`,
  `components/RoomMiniPlayer.test.tsx`, `components/MessageImages.test.tsx`,
  `pages/AudioDetailPage.test.tsx`, `lib/audioWaveform.test.ts`, `hooks/useAudioWaveform.test.ts`,
  `components/ChatImageAttach.test.tsx` (the sheet and the dialog).
- By hand, in a browser: send two audio files from a room's files entry and check the sheet's lengths;
  play one, start the other (the first keeps its place); open the detail and come back (it plays on);
  leave the room (it stops).
