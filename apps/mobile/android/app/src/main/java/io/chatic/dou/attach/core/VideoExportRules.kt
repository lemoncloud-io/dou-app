package io.chatic.dou.attach.core

import java.io.File

/**
 * The rules of the Android video conversion that need no framework: which size a conversion targets,
 * what the size of its result is predicted to be, which hidden file it writes first, and which answer
 * each way it can fail gets. Kept apart from [io.chatic.dou.attach.VideoExporter], which runs the
 * Media3 Transformer, so plain JVM tests cover them.
 *
 * The web asks for a conversion with `PrepareVideo` and holds the result to the server's 300 MiB video
 * limit. Android has no size estimate to ask the way iOS's `estimatedOutputFileLengthInBytes` is, so the
 * size is predicted from the length and a target bitrate, in at most two steps (1080p, then 720p), and
 * the web's re-check of the real result decides the rest.
 */
object VideoExportRules {

    /** One size a conversion may target: the box the picture is fitted into, and the bitrate it is encoded at. */
    enum class Step(val longEdge: Int, val shortEdge: Int, val videoBitrate: Int) {
        P1080(longEdge = 1920, shortEdge = 1080, videoBitrate = 10_000_000),
        P720(longEdge = 1280, shortEdge = 720, videoBitrate = 6_000_000),
    }

    /** What an AAC track is encoded at; it is predicted at this whether or not the source has audio. */
    const val AUDIO_BITRATE = 128_000

    /** What [chooseStep] found. */
    sealed class StepChoice {
        data class Convert(val step: Step) : StepChoice()

        /** Over the ceiling even at the lowest step. */
        object TooLarge : StepChoice()
    }

    /** The predicted size of [durationUs] of video at [step], audio included, in bytes. */
    fun predictedBytes(durationUs: Long, step: Step): Long =
        Math.round(durationUs / 1_000_000.0 * (step.videoBitrate + AUDIO_BITRATE) / 8.0)

    /**
     * The step to convert with: 1080p, or 720p when 1080p is predicted over [maxBytes], or
     * [StepChoice.TooLarge] when 720p is too. There is no step below 720p. A length that is not known
     * (no `KEY_DURATION`) cannot be predicted: it converts at 1080p and the re-check of the result
     * decides.
     */
    fun chooseStep(durationUs: Long?, maxBytes: Long): StepChoice {
        if (durationUs == null || durationUs <= 0) return StepChoice.Convert(Step.P1080)
        return Step.entries.firstOrNull { predictedBytes(durationUs, it) <= maxBytes }
            ?.let { StepChoice.Convert(it) }
            ?: StepChoice.TooLarge
    }

    /**
     * The size a picture shown at [width] × [height] is scaled to for [step]: inside its long × short
     * box whichever way round the picture is, the ratio kept, never enlarged, both sides even (an
     * H.264 encoder takes nothing else). A picture already inside the box keeps its size, rounded down
     * to even only when it is odd.
     */
    fun targetSize(width: Int, height: Int, step: Step): Pair<Int, Int> {
        if (width <= 0 || height <= 0) return width to height
        val scale = minOf(
            1.0,
            step.longEdge.toDouble() / maxOf(width, height),
            step.shortEdge.toDouble() / minOf(width, height),
        )
        if (scale >= 1.0) return even(width.toDouble(), roundDown = true) to even(height.toDouble(), roundDown = true)
        return even(width * scale, roundDown = false) to even(height * scale, roundDown = false)
    }

    /** Whether [targetSize] changes [width] × [height] at all, so the conversion needs no scaling effect. */
    fun scales(width: Int, height: Int, step: Step): Boolean = targetSize(width, height, step) != (width to height)

    private fun even(value: Double, roundDown: Boolean): Int {
        val rounded = if (roundDown) Math.floor(value / 2).toInt() * 2 else (Math.round(value / 2.0) * 2).toInt()
        return maxOf(2, rounded)
    }

    /**
     * The hidden file one conversion writes before it replaces its target. [id] is unique per
     * conversion, so two conversions of one video never write into one file; a leftover one is swept
     * with its folder after a day.
     */
    fun stagingName(id: String): String = ".export-$id.mp4"

    /** Whether [name] is a conversion's staging file. */
    fun isStagingName(name: String): Boolean = name.startsWith(".export-") && name.endsWith(".mp4")

    /**
     * The file a conversion of [source] ends up as: the source's name with its extension changed to
     * `.mp4`, in the source's own folder. An `.mp4` source (the Photo Picker names every video that,
     * HEVC ones too) is replaced through the staging file, so a retry with the same URI finds an
     * H.264 `mp4` and makes only the poster.
     */
    fun target(source: File): File = File(source.parentFile, AttachPickRules.mp4Name(source.name))

    // ---- Failures -------------------------------------------------------------------------------

    /** What went wrong in a conversion, as the Transformer's error codes group — see [failureCode]. */
    enum class Failure {
        /** No decoder for the source's codec on this device, or one that cannot start on it. */
        DECODER,

        /** The source file is gone or unreadable. */
        SOURCE,

        /** Everything else — an encoder that failed, muxing that stalled, a conversion cut short. */
        OTHER,
    }

    /**
     * The `PrepareVideo` error code for a [failure]. A source this device cannot decode is
     * `UNSUPPORTED` — the same file fails the same way again, so the web offers delete only. A missing
     * source is `SOURCE`. Anything else is `SYSTEM`, which the web may retry: an encoder that failed,
     * a conversion cut short when the app left the screen.
     */
    fun failureCode(failure: Failure): String = when (failure) {
        Failure.DECODER -> "UNSUPPORTED"
        Failure.SOURCE -> "SOURCE"
        Failure.OTHER -> "SYSTEM"
    }
}
