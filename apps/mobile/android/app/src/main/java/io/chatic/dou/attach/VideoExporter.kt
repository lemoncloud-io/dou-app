package io.chatic.dou.attach

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.attach.core.VideoExportRules
import io.chatic.dou.attach.core.VideoExportRules.Failure as FailureKind
import io.chatic.dou.attach.core.VideoExportRules.Step
import io.chatic.dou.attach.core.VideoExportRules.StepChoice
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference

/**
 * Converts a video the shell cannot send as it is — HEVC, a QuickTime `.mov`, audio that is not AAC,
 * another container — to an H.264/AAC `mp4` with Media3's Transformer, the Android counterpart of the
 * `AVAssetExportSession` export iOS does. Media3 is the shell's only video dependency: a hand-written
 * MediaCodec pipeline would have to carry decoding, scaling, tone mapping, audio re-encoding and an MP4
 * writer, each of which the Transformer already has.
 *
 * The picture is fitted inside 1920 × 1080 (either way round, never enlarged) at 10 Mbit/s, or inside
 * 1280 × 720 at 6 Mbit/s when the first is predicted over the video ceiling ([VideoExportRules.chooseStep]).
 * Frame rate and rotation stay as the source has them; a 10-bit HDR source is tone mapped to SDR.
 * The result is written to a hidden staging file first and moved over its target, so a name that
 * already holds the source (an HEVC `clip.mp4`) is never left half written. The Transformer writes the
 * index (`moov`) before the samples, so the web can start playing before the download ends.
 *
 * Runs on the caller's thread and blocks it until the conversion ends; `PrepareVideo` calls it from
 * its own thread. Nothing here is cancelled when the app leaves the screen — a conversion that the OS
 * stops fails as the Transformer reports it, which is `SYSTEM`, and the web's retry starts over.
 */
@UnstableApi
class VideoExporter(private val context: Context) {

    companion object {
        private const val TAG = "VideoExporter"
    }

    /** A conversion that produced no file, carrying the code `PrepareVideo` answers. */
    class Failure(val code: String, message: String) : Exception(message)

    /** The conversion running now, so a React reload can stop it. */
    private class Running(val transformer: Transformer, val handler: Handler)

    private val running = AtomicReference<Running?>(null)

    /** Stops the conversion running now, if any; its caller is answered `SYSTEM`. */
    fun cancel() {
        running.get()?.let { job -> job.handler.post { job.transformer.cancel() } }
    }

    /**
     * Converts [source] — judged [inspection] — and returns the converted file, which replaces its
     * target ([VideoExportRules.target]). Throws [Failure].
     */
    fun convert(source: File, inspection: PickedCopies.VideoInspection.Readable): File {
        val video = inspection.video ?: throw Failure("UNSUPPORTED", "the file has no video track")
        val mime = video.getString(MediaFormat.KEY_MIME).orEmpty()
        if (!hasDecoder(mime)) throw Failure("UNSUPPORTED", "this device cannot decode $mime")

        val durationUs = if (video.containsKey(MediaFormat.KEY_DURATION)) video.getLong(MediaFormat.KEY_DURATION) else null
        val step = when (val choice = VideoExportRules.chooseStep(durationUs, AttachPickRules.VIDEO_MAX_BYTES)) {
            is StepChoice.Convert -> choice.step
            StepChoice.TooLarge -> throw Failure("TOO_LARGE", "the video is over the size limit even at 720p")
        }
        val rotation = if (video.containsKey(MediaFormat.KEY_ROTATION)) video.getInteger(MediaFormat.KEY_ROTATION) else 0
        val (width, height) = AttachPickRules.displaySize(video.getInteger(MediaFormat.KEY_WIDTH), video.getInteger(MediaFormat.KEY_HEIGHT), rotation)
        val hdr = AttachPickRules.isHdrTransfer(if (video.containsKey(MediaFormat.KEY_COLOR_TRANSFER)) video.getInteger(MediaFormat.KEY_COLOR_TRANSFER) else null)

        val staging = File(source.parentFile, VideoExportRules.stagingName(UUID.randomUUID().toString()))
        try {
            export(source, staging, step, width, height, hdr)
            if (!staging.isFile || staging.length() == 0L) throw Failure("SYSTEM", "the conversion wrote nothing")
            val target = VideoExportRules.target(source)
            // rename replaces an existing target in one step; the delete is for a file system that will not.
            if (!staging.renameTo(target) && !(target.delete() && staging.renameTo(target))) {
                throw Failure("SYSTEM", "the converted video could not be moved into place")
            }
            return target
        } finally {
            staging.delete()
        }
    }

    /** Whether the device has any decoder for [mime]. Which of its profiles and sizes it takes is the Transformer's to find out. */
    private fun hasDecoder(mime: String): Boolean =
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
            !info.isEncoder && info.supportedTypes.any { it.equals(mime, ignoreCase = true) }
        }

    /**
     * One conversion into [staging]. An HDR source is tone mapped with OpenGL, and again with the
     * decoder if that fails: which of the two a device supports is not something to ask it up front.
     */
    private fun export(source: File, staging: File, step: Step, width: Int, height: Int, hdr: Boolean) {
        val modes = if (hdr) {
            listOf(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL, Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_MEDIACODEC)
        } else {
            listOf(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
        }
        var failure: ExportException? = null
        for ((index, mode) in modes.withIndex()) {
            staging.delete()
            failure = run(source, staging, step, width, height, mode)
            if (failure == null) return
            val canTryNext = index < modes.lastIndex && hdr && isToneMappingFailure(failure)
            if (!canTryNext) break
            Log.w(TAG, "tone mapping mode $mode failed (${failure.errorCodeName}); trying the next")
        }
        val error = failure ?: return
        Log.w(TAG, "conversion failed: ${error.errorCodeName}")
        val kind = classify(error)
        throw Failure(VideoExportRules.failureCode(kind), "the video could not be converted (${error.errorCodeName})")
    }

    /** One run of the Transformer; null when it completed, the error when it did not. */
    private fun run(source: File, staging: File, step: Step, width: Int, height: Int, hdrMode: Int): ExportException? {
        val (targetWidth, targetHeight) = VideoExportRules.targetSize(width, height, step)
        val videoEffects = if (VideoExportRules.scales(width, height, step)) {
            listOf(Presentation.createForWidthAndHeight(targetWidth, targetHeight, Presentation.LAYOUT_SCALE_TO_FIT))
        } else {
            emptyList()
        }
        val encoder = DefaultEncoderFactory.Builder(context)
            .setRequestedVideoEncoderSettings(
                VideoEncoderSettings.Builder()
                    .setBitrate(step.videoBitrate)
                    .setBitrateMode(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
                    .build()
            )
            .setEnableFallback(true)
            .build()
        val edited = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(source)))
            .setEffects(Effects(emptyList(), videoEffects))
            .build()
        val composition = Composition.Builder(EditedMediaItemSequence.withAudioAndVideoFrom(listOf(edited)))
            .setHdrMode(hdrMode)
            .build()

        // The Transformer reports on the thread it was built for, which must have a Looper.
        val thread = HandlerThread("attach-export").apply { start() }
        val handler = Handler(thread.looper)
        val done = CountDownLatch(1)
        val outcome = AtomicReference<ExportException?>(null)
        try {
            val transformer = Transformer.Builder(context)
                .setLooper(thread.looper)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .setEncoderFactory(encoder)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        done.countDown()
                    }

                    override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                        outcome.set(exportException)
                        done.countDown()
                    }
                })
                .build()
            running.set(Running(transformer, handler))
            handler.post { transformer.start(composition, staging.path) }
            try {
                done.await()
            } catch (e: InterruptedException) {
                handler.post { transformer.cancel() }
                Thread.currentThread().interrupt()
                throw Failure("SYSTEM", "the conversion was interrupted")
            }
            return outcome.get()
        } finally {
            running.set(null)
            thread.quitSafely()
        }
    }

    private fun isToneMappingFailure(error: ExportException): Boolean =
        error.errorCode == ExportException.ERROR_CODE_VIDEO_FRAME_PROCESSING_FAILED ||
            error.errorCode == ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED

    /** Groups the Transformer's error codes the way [VideoExportRules.failureCode] answers them. */
    private fun classify(error: ExportException): FailureKind = when (error.errorCode) {
        ExportException.ERROR_CODE_DECODER_INIT_FAILED,
        ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED -> FailureKind.DECODER
        ExportException.ERROR_CODE_IO_FILE_NOT_FOUND,
        ExportException.ERROR_CODE_IO_NO_PERMISSION -> FailureKind.SOURCE
        else -> FailureKind.OTHER
    }
}
