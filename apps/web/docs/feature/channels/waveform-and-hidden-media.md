# waveform and hidden media — what this device remembers about a room's files

Two small pieces of per-device state sit beside the message cache: the media a person hid, and the
waveform bars computed for audio files. How hiding looks to the user is in
[room-files.md](./room-files.md#delete-hides-on-this-device-only), and where the waveform is drawn is
in [audio-files.md](./audio-files.md#the-waveform--libaudiowaveformts-hooksuseaudiowaveformts). This page
holds the rules in the code: `lib/localMediaPrefs.ts` and `lib/audioWaveform.ts`.

## The stored state — `lib/localMediaPrefs.ts`

- **Why not the message row.** Neither piece is server state, and a mark on a cached row would be lost
  when a page from the server rewrites it. Both are kept in the page's device store under one entry
  per cloud and account: `dou.hiddenMedia:<cid>:<uid>` and `dou.waveforms:<cid>:<uid>`.
- **Keys are server identities.** A hidden item is `<channelId>:<chatNo>:<idx>`, the media index's
  own identity for an entry, so a hidden key and a row of the room's file list always name the same
  thing. A waveform is keyed by upload id. Clearing the message cache therefore loses neither;
  clearing the app's data loses both, which is accepted: a hidden file shows again and a waveform is
  computed again.
- **Reading a hidden message.** `hiddenPartsOf` turns a message's hidden keys into the upload
  positions and the link addresses to leave out. It needs the message's channel id and chat number,
  and answers nothing when none of its entries is hidden.
- **Reads and writes never throw.** A store that throws, or holds something that is not what was
  written, reads as "nothing stored": the hidden set drops anything that is not a string, and a
  waveform entry that is not either `'decorative'` or a list of numbers between 0 and 1 is ignored.
  A write that fails is swallowed, so hiding may then not stick, but the screen keeps working.
- **Reads are cheap.** The parsed hidden set is kept per scope and rebuilt only after a hide or an undo,
  so a render that reads it does no parsing.
- **A scope is needed.** With no cloud or account yet, nothing is hidden.
- **The waveform list is a least-recently-used list.** Each stored entry is `{ order, bars }`. A write
  makes the upload the newest and drops the oldest past 500. Reading a waveform also makes it the
  newest, so what a person keeps opening stays.

## How the bars are made — `lib/audioWaveform.ts`

The limits (20 MB, 15 minutes, 8 kHz mono) and what happens on leaving the screen are in
[audio-files.md](./audio-files.md#the-waveform--libaudiowaveformts-hooksuseaudiowaveformts). The rest:

- **Why 8 kHz.** It is enough for a loudness envelope. A 15-minute file decoded at 8 kHz mono is
  about 29 MB of samples, a sixth of what a 48 kHz decode costs.
- **The decode context.** The browser's offline audio context is created at the low rate with a
  one-second length. That length only sizes a render that is never run: `decodeAudioData` resamples
  to the context's rate whatever the file's. The prefixed constructor is used where the plain one
  is missing; with neither, the result is `unsupported`.
- **Bars.** The samples are cut into 48 equal stretches, each the RMS of its samples, scaled so the
  loudest is 1. Nothing is drawn lower than 0.04, so silence reads as a row of the smallest bar
  rather than as nothing, and the shape is still there to seek on. A file that is entirely silent
  gets that row.
- **The result is one of three kinds.** `bars` are stored. `decorative` (too large, too long, a
  failed download, a decode error or no decoder) is stored as `'decorative'` so it is not tried on
  every visit. `aborted` (the screen went away first) stores nothing. A size or length that was
  unknown before the download is checked after it, against the downloaded bytes and the decoded
  length.
- **Only the bars are kept.** The downloaded bytes and the decoded buffer are dropped as soon as the
  bars exist.
