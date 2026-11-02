# ADR-0270: The phone sends, records and plays audio, and the shell does the recording

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/mobile-audio-attachment`
> · Scope: `apps/web/src/app/features/channels/` (`useVoiceMessage`, `MessageAudioCard`,
> `useInlineAudio`, `lib/fileExport.ts`), `apps/web/src/app/bridge/audioRecorder.ts`,
> `libs/bridge-messages/src/types/model/audio-recording.ts`, `libs/web-ui-kit`'s `AttachPanel` (the voice
> entry), `apps/mobile/src/app/webview/hooks/audioRecordingHandlers.ts`,
> `apps/mobile/ios/Bridges/AudioRecorder/`, `apps/mobile/android/.../io/chatic/dou/record/`, the two shells'
> pickers, save lists and byte families, `libs/bridges/src/version.ts` (2.13.0)
> · Amends: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md)
> — only its note that the microphone arrives with the first reviewed page that needs it (decision 6)

## Context

The server takes four audio formats — `audio/mpeg` (MP3), `audio/mp4` (M4A), `audio/wav` and
`audio/ogg` — at 50 MiB each, with no aliases, and checks each upload's first bytes against its type.
The desktop app sends audio files and plays received ones in the feed. The phone did neither: the web
left audio out of its file inputs and its judgement (`sendsNoAudio`), neither shell's documents picker
offered an audio type, a received audio upload was drawn as a document card with no player, and saving
one failed because neither shell's save list knew the extensions. The phone also had no microphone at
all — no purpose string on iOS, no `RECORD_AUDIO` on Android.

Voice messages need a recording that the server takes. A page can record by itself (`getUserMedia` and
`MediaRecorder`), but what it writes depends on the engine: Android's WebView writes WebM/Opus, which
the server refuses, and WebKit writes MP4 under its own rules. The shell, on the other hand, already
keeps files the page uploads from its own folder (ADR-0158), and both OS recorders write AAC in an
MPEG-4 file — the server's `audio/mp4` as it is.

## Decision

1. **The phone sends the four audio formats as files.** The web drops `sendsNoAudio` from its file
   inputs, its pick judgement and its share page; the shells' documents pickers offer the four types;
   the format table in `@chatic/data` and its aliases are unchanged. An audio file goes as `file`, held
   to 50 MiB, under the server's canonical type whatever alias the picker reported.
2. **Voice messages are recorded by the shell, not the page.** A new pair of bridge messages —
   `StartAudioRecording`, `StopAudioRecording`, answered by `OnAudioRecordingStarted` and
   `OnAudioRecordingEnded`, the second also pushed when the shell ends a recording itself — drives
   `AVAudioRecorder` on iOS and `MediaRecorder` on Android. Each recording is AAC-LC, mono, 44.1 kHz,
   64 kbps in an `.m4a` named `voice-<yyyyMMdd-HHmmss>.m4a`, written into a pick folder of its own and
   answered with the same `file` reference the documents picker gives, so the upload is ADR-0158's path
   unchanged. The page never opens the microphone.
3. **Recorded in a sheet from the attach panel, five minutes, and an interruption throws it away.** The
   attach panel gains a Voice entry after Files, which opens a recording sheet; the composer gets no
   microphone. A tap on the sheet's microphone records, and then Send sends and Cancel throws it away;
   while it records, the backdrop, a swipe and Escape do nothing. Under a second nothing is kept. At five
   minutes the shell stops and the recording is sent. A call, another app taking the audio or the app
   leaving the screen discards it. There is no pause, no preview before sending and no waveform; the
   received card shows time and a seek bar only.

    Hold-to-talk on the composer's send-button place was built first and dropped: a press-and-hold has
    to be learned, the first press is spent on the OS permission prompt, and a microphone where the send
    button sits put a recording one stray touch away. A sheet costs one more tap per message and keeps
    recording a deliberate act, with its own room for the clock and both outcomes.

4. **Received audio plays in place, in the page.** A sent audio upload is a player card — play, seek,
   the clock, Save and Share in a menu — playing from its signed address in the page's own `<audio>`,
   one at a time. Its length comes from the file's header: the upload carries none, and nothing marks a
   recording as one except its name.
5. **An older app is told apart by its handshake, and by its save.** The voice entry is drawn only
   where the handshake lists `StartAudioRecording`. An older app's `SaveFile` refuses an audio name as
   `INVALID`; the web reads that, as it does for a ZIP archive, as an app to update. Playback needs
   nothing of the shell.
6. **The sub WebView keeps ADR-0265's terms for the microphone.** Declaring the permission makes it
   available to every WebView in the app, and react-native-webview offers no way to refuse audio alone.
   The microphone is left to the OS prompt, as the camera is, and what keeps that safe is the review a
   page passes before it goes on an allowlisted domain. Nothing in code blocks it.

## Consequences

- **The phone and the desktop now exchange the same four formats**, and a voice message from the phone
  is an ordinary `audio/mp4` upload a desktop already plays.
- **Recording needs a new app.** The web ships first and shows no voice entry until the shell answers
  the handshake with the recorder, so the entry appears for each person when they update.
- **The page plays what the WebView decodes.** iOS decodes Ogg Opus but not Ogg Vorbis, and nothing in
  the upload says which an Ogg file is, so a Vorbis file shows "can't play" there and stays savable and
  shareable. The app's own recordings are AAC and play everywhere.
- **The microphone permission is the app's, not the feature's.** A reviewed page in the sub WebView can
  ask for it under DoU's name, and on Android a page's audio request is granted without a prompt once
  the app holds `RECORD_AUDIO`. Blocking it would need a patched WebView library — a dependency to keep
  re-applying on every upgrade — for a page that does not exist yet.
- **No waveform, no "voice message" mark.** The server has no field for either, and adding one is a
  contract change for every client; a recording is known by its name, and a received card shows time.
- **Native code is outside CI.** The recorders and the shells' byte rules are covered by Swift and
  Kotlin unit tests run by hand, and the recorders themselves only on a device or simulator.
