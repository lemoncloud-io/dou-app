# Audio recording — voice messages

A voice message is recorded through the shell, never through the page. The web's recording sheet,
opened from the chat attach panel's voice entry, asks the shell to start when its microphone is tapped
and to stop at Send or Cancel; the shell
records with the OS recorder into a file of its own and answers with the same `file` reference the
documents picker gives ([attachment-picker.md](./attachment-picker.md)). The web then sends it like
any picked file: `StartFileTransfer` uploads it from the shell's folder, and its bytes never cross the
bridge. The web side — the entry, the sheet, its clock and buttons — is
[apps/web channels/image-send.md](../../../web/docs/feature/channels/image-send.md#voice-messages).

| Message               | Reply                     | What it does                                                         |
| --------------------- | ------------------------- | -------------------------------------------------------------------- |
| `StartAudioRecording` | `OnAudioRecordingStarted` | Asks for the microphone when undecided, then starts recording        |
| `StopAudioRecording`  | `OnAudioRecordingEnded`   | Ends it: `send` keeps the file, `cancel` deletes it                  |
| —                     | `OnAudioRecordingEnded`   | Pushed when the shell ends a recording itself: its limit, or a break |

The types are `model/audio-recording.ts` in `@chatic/bridge-messages`. The handlers are
`webview/hooks/audioRecordingHandlers.ts`, over `bridge/AudioRecorderBridge.ts`; the native modules
are `ios/Bridges/AudioRecorder/` and `android/.../io/chatic/dou/record/`.

## Why the shell records, and not the page

The server takes four audio formats — MP3, M4A, WAV and Ogg — and no other. A page's own
`MediaRecorder` writes WebM on Android's WebView, which the server refuses, and something else again on
iOS, so a recording made in the page would need converting before it could be sent. The OS recorders
both write AAC in an MPEG-4 file, which is the server's `audio/mp4` as it is. The shell also hears what
the page cannot: a call taking the audio, the app leaving the screen. And the upload then follows the
path every file the shell keeps already follows, background and all.

## The recording

- **Format.** AAC-LC, mono, 44.1 kHz, 64 kbps, in an `.m4a` (MPEG-4) file typed `audio/mp4` — about
  2.4 MB for five minutes. iOS uses `AVAudioRecorder` (`kAudioFormatMPEG4AAC`), Android `MediaRecorder`
  (`AudioSource.MIC`, `OutputFormat.MPEG_4`, `AudioEncoder.AAC`).
- **Where.** `<cache>/attach-pick/<uuid>/voice-<yyyyMMdd-HHmmss>.m4a`, a folder of its own per
  recording, named by the local time it started. That is a pick folder's shape, so the transfer accepts
  it as an upload source and the picker's 24-hour sweep removes it; a start runs that sweep, as a pick
  does, so a person who only sends voice messages does not pile up recordings. One shared folder would
  never be swept: the sweep ages a folder by its newest change.
- **The limit is five minutes** (300,000 ms). The web asks for it; anything missing, zero or larger
  means it. The recorder enforces it itself (`record(forDuration:)`, `setMaxDuration`), stops there, and
  the shell pushes `MAX_DURATION` with the file: what was said up to the limit is sent.
- **Under a second is not kept.** A `send` that comes sooner deletes the file and answers `TOO_SHORT`;
  the web tells the person to hold the button. The time is measured on a clock the wall clock's changes
  do not move.
- **The file is checked before it is handed back:** bytes 4–7 must be `ftyp`, the same test the
  server's signature check makes. A file that fails it is deleted and the end is `INTERNAL`. iOS writes
  the major brand `M4A `, Android `mp42`; the downloads' byte families tell an M4A from a video by that
  brand or by the `.m4a` name ([media-export.md](./media-export.md)).
- **One recording at a time.** A second start is `BUSY`.

## How it ends

Exactly one end is reported per recording. `stop` ends it as asked; whichever comes first — a stop,
the limit, an interruption — is the end, and the other finds nothing: a late `stop` is refused
`NOT_RECORDING`, and a late callback is ignored.

| Reason         | When                                                    | File    | Reported as   |
| -------------- | ------------------------------------------------------- | ------- | ------------- |
| `SENT`         | `stop` with `send`, a second or more in                 | kept    | reply         |
| `TOO_SHORT`    | `stop` with `send` under a second in                    | deleted | reply         |
| `CANCELLED`    | `stop` with `cancel` — slid away, or the screen left    | deleted | reply         |
| `MAX_DURATION` | the limit reached                                       | kept    | push          |
| `INTERRUPTED`  | a call or another app taking the audio, the app leaving | deleted | push          |
| `INTERNAL`     | the recorder failed, or wrote a file that is not MPEG-4 | deleted | reply or push |

- **iOS** ends a recording on `AVAudioSession.interruptionNotification` (began), on
  `willResignActive` and `didEnterBackground`, and on a media-services reset (`INTERNAL`). A recorder
  that finishes by itself within half a second of the limit is `MAX_DURATION`; one that stopped earlier
  was cut off by the system and is `INTERRUPTED`.
- **Android** ends one when audio focus is lost (`AUDIOFOCUS_LOSS`, `AUDIOFOCUS_LOSS_TRANSIENT`) and on
  `onHostPause`. A loss that only asks to duck — a notification chime — does not end it. A start that
  comes in while the screen is still pausing for the permission dialog is let through, and ended as
  `INTERRUPTED` when the screen has not resumed a second later, so a start that lands in the background
  does not record silence until the limit. Audio focus refused at the start (during a call) is
  `INTERNAL`.
- A bridge reload deletes a running recording and reports nothing: the page that asked for it is gone.

## Permission

`PermissionService` asks for `MICROPHONE` in the handler, at the first start — `check` first, so a
granted microphone costs nothing, then `request`, which shows the OS prompt while it is undecided and
answers at once after a refusal. A refusal, or one made earlier, is `PERMISSION_DENIED`, and the web
offers Settings through `OpenSettings`. The native modules only check the permission and refuse with
the same code when it is missing; they never prompt.

On iOS, react-native-permissions answers `MICROPHONE` only because the Podfile's `setup_permissions`
lists `Microphone`; without that handler compiled in it answers `unavailable`, which reads as a
refusal on every start.

The app declares `NSMicrophoneUsageDescription` (a Korean string, like the other purpose strings in
`Info.plist`) and `RECORD_AUDIO`. Declaring them makes the microphone available to the WebViews too;
the sub WebView's terms for it are in [../webview/sub-webview.md](../webview/sub-webview.md).

A grant at the prompt answers the same start: the recording begins as soon as the prompt closes. If
the sheet was closed meanwhile, the web stops what has just started, silently.

## The audio session (iOS)

The audio session is the app's, shared with the WebView's video and audio playback. A start remembers
its category, mode and options, switches it to `.playAndRecord`, mode `.default`,
`[.defaultToSpeaker, .allowBluetoothHFP]`, and activates it; every end — whatever its reason — stops
the recorder, deactivates the session with `.notifyOthersOnDeactivation` so another app's music
resumes, and puts the category, mode and options back. A deactivation the system refuses (the WebView
still playing) does not stop the rest from being restored. Without this, playback after a recording
came out of the earpiece, or another app's music never came back.

Android's `MediaRecorder` takes audio focus (`AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE`) for the recording
and gives it up at every end.

## Older apps

The web shows the microphone only when the handshake lists `StartAudioRecording`, and the router
registers it only where the native module exists — an app built before the recorder never shows the
control. Received audio plays in the page's own `<audio>`, which needs nothing of the shell.

## How to verify

```bash
npx jest --config apps/mobile/jest.config.js apps/mobile/src/app/webview/hooks/audioRecordingHandlers \
  apps/mobile/src/app/bridge/AudioRecorderBridge apps/mobile/src/app/webview/hooks/appEvents \
  apps/mobile/src/app/webview/hooks/useWebMessageRouter
xcodebuild test -project apps/mobile/ios/Chatic.xcodeproj -scheme ChaticTransferCoreTests \
  -destination 'id=<simulator UDID>'                 # AudioRecorderCoreTests among them
(cd apps/mobile/android && ./gradlew :app:testDevDebugUnitTest --tests "io.chatic.dou.record.*")
```

The pure rules — the limit, the end reasons, the name, the header check — are the core files
(`AudioRecorderCore.swift`, `AudioRecordRules.kt`) and their tests. The recorders themselves only run
on a device or simulator: in a room, open the attach panel's voice entry, tap the microphone, talk for
a few seconds and tap Send; the file is
under `Library/Caches/attach-pick/` in the app's container (iOS) or `cache/attach-pick/` (Android)
until it is swept. The simulator records from the Mac's microphone; the Android emulator from the
host's when its virtual microphone uses host audio input.
