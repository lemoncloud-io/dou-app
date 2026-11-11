# ADR-0280: Android converts videos it cannot send as they are, with Media3's Transformer

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/android-hevc-export`
> · Scope: `apps/mobile/android` (`app/build.gradle`, `attach/`, `module/AttachmentPickerModule.kt`)
> · Module doc: [apps/mobile docs/native/attachment-picker.md](../../apps/mobile/docs/native/attachment-picker.md)

## Context

The attachment picker sends a chat video as an H.264/AAC `mp4`, the one format every receiver plays.
iOS has always converted what is not already that: `AVAssetExportSession` at 1080p, stepping down to
720p when the estimate passes the 300 MiB video limit, then refusing. Android did not convert. It
sent an `mp4` of H.264 and AAC as it was and answered everything else `UNSUPPORTED`, on the grounds
that converting needs a codec pipeline the app did not have and the Android platform has no export
session to borrow.

That held until the files people actually pick stopped being H.264. An iPhone's `.mov` is HEVC, so is
a Samsung's "high efficiency video" recording, and a user could not send a clip they had just moved
from an iPhone to an Android phone: 2160 × 3840, 60 fps, 48 MB, six seconds, refused. The decision is
to convert on Android too, and to keep the web and server contracts exactly as they are — the web
already reads `needsExport`, already calls `PrepareVideo` for every shell video, and already
re-checks the size of the result — so an older shell, an older web and a browser all keep working.

## Decision

**Android converts a video it cannot send as it is to an H.264/AAC `mp4` with Media3's `Transformer`,
and Media3 is the app's first video dependency.**

- **What is converted.** Anything that is not an `mp4` (a QuickTime brand is not one) of exactly one
  H.264 track and one AAC track or none: HEVC, a `.mov`, AMR or a second audio track, another
  container. What is not converted still goes up as it is, at any resolution.
- **How.** The picture is fitted inside 1920 × 1080 (either way round, never enlarged) at a 10 Mbit/s
  target; frame rate and rotation are the source's; a 10-bit HDR source is tone mapped to SDR; AAC audio
  is copied and other audio is re-encoded. The result is written to a hidden staging file and moved
  over its target, the same discipline as iOS, so a retry finds it ready.
- **Size, in two steps, before converting.** Android has no estimate to ask for, so it predicts from
  the length and the target bitrates, steps down once to 1280 × 720 at 6 Mbit/s when 1080p would pass
  300 MiB (about 4.1 minutes), and refuses when 720p would too (about 6.8 minutes). The web's re-check of
  the real size is the backstop for an encoder that overshoots.
- **Failures keep the contract's meaning.** A source this device cannot decode, a file with no video
  track and a container nothing reads are `UNSUPPORTED`: retrying gives the same answer, so the web
  offers delete only. Everything the encoder or the OS does wrong is `SYSTEM`, which the web may retry.
- **The picker judges at pick.** A video that will be converted is answered `needsExport` and is not
  held to the size limit then, because its size is only known afterwards. QuickTime joins the types
  the documents picker offers on Android, since an iPhone's `.mov` would otherwise be greyed out there.

## Why a dependency, and why this one

Every other part of the shell's native media code is the platform's own: `MediaExtractor` to read
tracks, `MediaMetadataRetriever` for the poster frame, no third-party library at all. Converting is
different in kind. It decodes a video, scales it, tone maps it when it is HDR, re-encodes it, mixes or
re-encodes the audio, and writes an `mp4` with its index in front, across devices whose codecs differ in
which profiles, sizes and colour formats they take.

Writing that against `MediaCodec` directly was the alternative, and it was rejected because each of
those parts is where the real defects are, not the happy path:

- A `MediaCodec` decoder to encoder pipeline needs an OpenGL surface in the middle to scale, and a
  second shader to tone map HLG or PQ, with the EGL, colour-space and texture details every
  manufacturer's driver gets slightly differently. The Transformer has exactly this, maintained by the
  platform's own media team and exercised on a long list of devices.
- Falling back when a device's encoder rejects a requested profile or bitrate, keeping timestamps
  right when frame rates are variable, and writing an `mp4` whose `moov` precedes `mdat` are each a
  small project. All three are behaviours the Transformer already has; the last was measured on its
  output rather than assumed.
- The code would be ours to keep alive across Android releases, for a feature that is a convenience
  for one kind of source file.

Other libraries were not weighed seriously: a bundled FFmpeg is tens of megabytes of native code per
ABI, licensed in ways a closed app has to track, and a second video stack beside the one the WebView
and the OS already use.

## Cost

- **APK size.** Version 1.11.1 (the current stable release when this was decided; `minSdk 24`,
  `compileSdk 36` and Kotlin 2.1.20 build with it) adds roughly 0.6 MB to an R8-shrunk release build in
  a probe that used the conversion path, with no native libraries. It adds `media3-transformer`,
  `-effect` and `-common`, and what they pull in (`-exoplayer`, `-muxer`, `-extractor`, `-container`,
  `-datasource`, `-decoder`, and Guava). Their API is marked unstable, so a Media3 upgrade is a
  deliberate change that is rebuilt and re-run on a device, not a routine version bump.
- **Time and heat.** An emulator with a software encoder converted a 4K, 60 fps, one-minute HEVC video
  to 1080p in 80 to 130 seconds. How a phone's hardware encoder behaves, its speed, its bitrate against
  the 10 Mbit/s target and its heat, has not been measured; the length limits are the first thing to
  revisit once it has.
- **Unmeasured on a device.** HDR tone mapping failed on the emulator at the shader step with both
  methods the code tries, so it is untested there; the OpenGL then decoder order is a guess to be
  confirmed on an HDR-capable phone.
- **Not done on purpose.** An H.264 `.mov` is re-encoded even though it would only need its container
  swapped, and an H.264 video with AMR audio is re-encoded too. Copying the video stream would be
  faster, but its output size would no longer be what the target bitrate predicts, and the two-step
  size decision depends on that.

## Consequences

- The shell gains one dependency family. R8 keeps what Media3 ships rules for; no project rule was
  needed.
- A converted video's cache is the picked size plus the result, until the 24-hour sweep.
- The photo grid's `KeepLibraryVideo` still judges a library video the old way and refuses what is not
  H.264/AAC `mp4`; extending it to the picker's judgement is a separate change.
