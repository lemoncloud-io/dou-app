package io.chatic.dou.record.core

import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.media.core.ExportFormats
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil

/**
 * The rules of the voice-message recorder that need no Android framework: the limit a recording is
 * held to, how it ended, what its file is called and where it lives, and the check that the file is
 * MPEG-4. Kept apart so plain JVM tests cover them; `MediaRecorder`, the audio focus and the screen's
 * lifecycle live in [io.chatic.dou.record.AudioRecorderModule].
 *
 * A recording is written where a pick is — its own folder in the picker's `attach-pick`, which the
 * upload rule already reads from and the picker's 24-hour sweep already clears:
 * ```
 * attach-pick/
 *   └ <uuid>/
 *       └ voice-20261102-093000.m4a
 * ```
 */
object AudioRecordRules {

    /** The longest recording, in ms: five minutes. A missing, non-positive or larger request means it. */
    const val MAX_DURATION_MS = 300_000L

    /** A `send` that comes sooner than this after the start is `TOO_SHORT`, and nothing is kept. */
    const val MIN_SEND_MS = 1_000L

    /** What a recording is typed as: AAC in an MPEG-4 container, one of the server's audio formats. */
    const val CONTENT_TYPE = "audio/mp4"

    /** AAC-LC, mono, 44.1 kHz, 64 kbps — enough for speech, about 480 KB a minute. */
    const val SAMPLE_RATE_HZ = 44_100
    const val BIT_RATE_BPS = 64_000
    const val CHANNELS = 1

    /** The limit applied to a `start`: [requestedMs] rounded up to a whole ms, or [MAX_DURATION_MS]. */
    fun clampMaxDuration(requestedMs: Double?): Long {
        if (requestedMs == null || !requestedMs.isFinite() || requestedMs <= 0 || requestedMs > MAX_DURATION_MS) return MAX_DURATION_MS
        // Rounded up, not down: 0.5 must not become 0, which MediaRecorder reads as "no limit".
        return ceil(requestedMs).toLong()
    }

    /** What the web asks a running recording to do. */
    enum class Action(val wire: String) {
        SEND("send"),
        CANCEL("cancel");

        companion object {
            fun fromWire(value: String?): Action? = entries.firstOrNull { it.wire == value }
        }
    }

    /** Why a recording is being ended: one of the web's two actions, or the shell's own reasons. */
    enum class Cause {
        SEND,
        CANCEL,

        /** The recorder reached the limit it was started with. */
        MAX_DURATION,

        /** A call, another app taking the audio focus, or the app leaving the foreground. */
        INTERRUPTION,

        /** The recorder reported an error. */
        ERROR;

        companion object {
            fun of(action: Action): Cause = if (action == Action.SEND) SEND else CANCEL
        }
    }

    /** The `reason` of the ended payload; the wire name is the enum name. */
    enum class Reason {
        SENT,
        MAX_DURATION,
        CANCELLED,
        TOO_SHORT,
        INTERRUPTED,
        INTERNAL,
    }

    /**
     * How a recording ended, from why it was ended, how long it ran, and whether `MediaRecorder.stop()`
     * finished the file. `stop()` throws when almost nothing was recorded, so a failed stop under a
     * second into a `send` is still `TOO_SHORT`, and a failed `send` stop is `INTERNAL`. At the limit the
     * recorder has already stopped itself and finished the file, so a `stop()` that throws then changes
     * nothing: the header check ([checked]) decides. Every reason but [Reason.SENT] and
     * [Reason.MAX_DURATION] deletes the file.
     */
    fun endReason(cause: Cause, elapsedMs: Long, recorderStopped: Boolean): Reason = when (cause) {
        Cause.CANCEL -> Reason.CANCELLED
        Cause.INTERRUPTION -> Reason.INTERRUPTED
        Cause.ERROR -> Reason.INTERNAL
        Cause.SEND -> when {
            elapsedMs < MIN_SEND_MS -> Reason.TOO_SHORT
            recorderStopped -> Reason.SENT
            else -> Reason.INTERNAL
        }
        Cause.MAX_DURATION -> Reason.MAX_DURATION
    }

    /** Whether a recording that ended for [reason] keeps its file. */
    fun keepsFile(reason: Reason): Boolean = reason == Reason.SENT || reason == Reason.MAX_DURATION

    /** A kept file whose first bytes are not MPEG-4 is not sent: its reason becomes [Reason.INTERNAL]. */
    fun checked(reason: Reason, head: ByteArray): Reason =
        if (keepsFile(reason) && !hasMp4Header(head)) Reason.INTERNAL else reason

    /** Whether a file's first bytes are MPEG-4: `ftyp` at bytes 4 to 7. */
    fun hasMp4Header(head: ByteArray): Boolean = ExportFormats.isMp4(head)

    /**
     * The duration reported with a kept file: the time it ran, held to the limit it was started with —
     * the limit's callback arrives a little after the recorder stopped at it.
     */
    fun durationMs(elapsedMs: Long, maxDurationMs: Long): Long = elapsedMs.coerceIn(0, maxDurationMs)

    /** `voice-<yyyyMMdd-HHmmss>.m4a`, by when the recording started in [zone] — as the picker names a `video-…`. */
    fun fileName(startedAtMs: Long, zone: TimeZone): String {
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).apply { timeZone = zone }.format(Date(startedAtMs))
        return "voice-$stamp.m4a"
    }

    /** Where a recording is written: [fileName] in its own [folderId] folder of `<cacheDir>/attach-pick`. */
    fun recordingFile(cacheDir: File, folderId: String, name: String): File =
        File(File(File(cacheDir, AttachPickRules.FOLDER), folderId), name)
}
