package io.chatic.dou.record

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.chatic.dou.attach.PickedCopies
import io.chatic.dou.attach.core.AttachPickRules.Kind
import io.chatic.dou.record.core.AudioRecordRules
import io.chatic.dou.record.core.AudioRecordRules.Action
import io.chatic.dou.record.core.AudioRecordRules.Cause
import io.chatic.dou.record.core.AudioRecordRules.Reason
import java.io.File
import java.io.FileInputStream
import java.util.TimeZone
import java.util.UUID

/**
 * AudioRecorder — the voice message, recorded with `MediaRecorder` into an `.m4a` in the picker's
 * `attach-pick` folder (see [AudioRecordRules] for the layout), and answered as the same `file`
 * reference a documents pick gets, so the web uploads it with `StartFileTransfer`.
 *
 * `start` and `stop` are the web's; the shell also ends a recording by itself — at its limit, on an
 * audio focus loss (a call, another app playing), when the screen is paused, or on a recorder error —
 * and reports that end as an `AudioRecorderEnded` event. A recording ends exactly once: everything
 * that touches it runs on one thread, and whichever end reaches that thread first takes it; a later
 * `stop` is `NOT_RECORDING`, a later event is dropped.
 *
 * The microphone permission is asked for by JS before `start`; this module only checks it was granted
 * and never prompts.
 */
class AudioRecorderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        private const val TAG = "AudioRecorder"
        const val ENDED_EVENT = "AudioRecorderEnded"
        private const val HEAD_BYTES = 12

        /**
         * How long a recording started while the screen is not resumed waits for it to resume. The
         * system's permission dialog pauses the screen, and the web starts right after the grant, which
         * can land just before the screen resumes; a start that is really in the background ends.
         */
        private const val RESUME_GRACE_MS = 1_000L
    }

    /** One running recording. Only the recorder thread reads or replaces it. */
    private class Recording(
        val recorder: MediaRecorder,
        val file: File,
        val name: String,
        val startedAtElapsedMs: Long,
        val maxDurationMs: Long,
        val focus: Focus,
    )

    /** A held audio focus, released with [abandon] whichever API took it. */
    private class Focus(val abandon: () -> Unit)

    private class Rejection(val code: String, message: String) : Exception(message)

    // The recorder thread: MediaRecorder created here posts its info and error callbacks here, and the
    // focus and lifecycle callbacks are posted here, so the recording's state needs no lock.
    private val thread = HandlerThread("audio-recorder").apply { start() }
    private val handler = Handler(thread.looper)

    private val copies = PickedCopies(reactContext)
    private var current: Recording? = null

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "AudioRecorder"

    override fun invalidate() {
        reactApplicationContext.removeLifecycleEventListener(this)
        // Nobody is left to hear the end, so it is not reported; the file goes with it.
        handler.post { end(Cause.INTERRUPTION) }
        thread.quitSafely()
        super.invalidate()
    }

    // Required by NativeEventEmitter; the event is emitted whether or not anything listens.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    @ReactMethod
    fun start(maxDurationMs: Double, promise: Promise) {
        handler.post {
            try {
                promise.resolve(begin(AudioRecordRules.clampMaxDuration(maxDurationMs)))
            } catch (e: Rejection) {
                promise.reject(e.code, e.message)
            } catch (e: Exception) {
                Log.w(TAG, "start failed", e)
                promise.reject(Reason.INTERNAL.name, describe(e))
            }
        }
    }

    @ReactMethod
    fun stop(action: String?, promise: Promise) {
        val parsed = Action.fromWire(action)
        if (parsed == null) {
            promise.reject("INVALID", "action must be send or cancel")
            return
        }
        handler.post {
            try {
                val ended = end(Cause.of(parsed))
                if (ended == null) promise.reject("NOT_RECORDING", "nothing is recording") else promise.resolve(ended)
            } catch (e: Exception) {
                Log.w(TAG, "stop failed", e)
                promise.reject(Reason.INTERNAL.name, describe(e))
            }
        }
    }

    override fun onHostResume() = Unit

    // Leaving the foreground ends the recording: Android silences a background app's microphone.
    override fun onHostPause() {
        handler.post { end(Cause.INTERRUPTION)?.let(::emit) }
    }

    override fun onHostDestroy() {
        handler.post { end(Cause.INTERRUPTION)?.let(::emit) }
    }

    // ---- On the recorder thread -----------------------------------------------------------------

    private fun begin(maxDurationMs: Long): WritableMap {
        if (current != null) throw Rejection("BUSY", "a recording is already running")
        val context = reactApplicationContext
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            throw Rejection("PERMISSION_DENIED", "the microphone permission is not granted")
        }
        val name = AudioRecordRules.fileName(System.currentTimeMillis(), TimeZone.getDefault())
        val file = AudioRecordRules.recordingFile(context.cacheDir, UUID.randomUUID().toString(), name)
        val folder = file.parentFile ?: throw Rejection(Reason.INTERNAL.name, "the recording has no folder")
        if (!folder.mkdirs()) throw Rejection(Reason.INTERNAL.name, "cannot create the recording folder")

        var focus: Focus? = null
        var recorder: MediaRecorder? = null
        try {
            focus = requestFocus() ?: throw Rejection(Reason.INTERNAL.name, "the audio focus was refused")
            // Held before it is configured, so a prepare that throws still releases it.
            val started = newRecorder().also { recorder = it }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioChannels(AudioRecordRules.CHANNELS)
                setAudioSamplingRate(AudioRecordRules.SAMPLE_RATE_HZ)
                setAudioEncodingBitRate(AudioRecordRules.BIT_RATE_BPS)
                setMaxDuration(maxDurationMs.toInt())
                setOutputFile(file.path)
                prepare()
            }
            started.setOnInfoListener { source, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED && current?.recorder === source) {
                    end(Cause.MAX_DURATION)?.let(::emit)
                }
            }
            started.setOnErrorListener { source, what, extra ->
                Log.w(TAG, "recorder error $what/$extra")
                if (current?.recorder === source) end(Cause.ERROR)?.let(::emit)
            }
            started.start()
            val startedAt = System.currentTimeMillis()
            val recording = Recording(started, file, name, SystemClock.elapsedRealtime(), maxDurationMs, focus)
            current = recording
            // A start that lands while the screen is paused would record silence until its limit, with no
            // pause left to end it.
            if (context.lifecycleState != LifecycleState.RESUMED) {
                handler.postDelayed({
                    if (current === recording && reactApplicationContext.lifecycleState != LifecycleState.RESUMED) {
                        end(Cause.INTERRUPTION)?.let(::emit)
                    }
                }, RESUME_GRACE_MS)
            }
            // Someone who only sends voice messages never picks, so the picker's sweep runs here too —
            // after the start, so a full folder never delays the first words. Only folders a day old go.
            handler.post { copies.sweep() }
            return Arguments.createMap().apply {
                putDouble("startedAt", startedAt.toDouble())
                putDouble("maxDurationMs", maxDurationMs.toDouble())
            }
        } catch (e: Exception) {
            recorder?.let { runCatching { it.release() } }
            focus?.abandon?.invoke()
            folder.deleteRecursively()
            if (e is Rejection) throw e
            throw Rejection(Reason.INTERNAL.name, "the recorder could not start: ${describe(e)}")
        }
    }

    /**
     * Ends the running recording for [cause] and answers the ended payload, or null when nothing is
     * recording — it already ended. The file is kept only for `SENT` and `MAX_DURATION`, and only when
     * it is MPEG-4; every other end deletes its folder.
     */
    private fun end(cause: Cause): WritableMap? {
        val recording = current ?: return null
        current = null
        val elapsed = SystemClock.elapsedRealtime() - recording.startedAtElapsedMs
        // After an error the recorder is in no state to stop; it is only released.
        val stopped = cause != Cause.ERROR && try {
            recording.recorder.stop()
            true
        } catch (e: RuntimeException) {
            // Thrown when almost nothing was recorded; the file is unfinished either way.
            Log.w(TAG, "stop threw after ${elapsed}ms: ${e.javaClass.simpleName}")
            false
        }
        runCatching { recording.recorder.release() }
        recording.focus.abandon()

        var reason = AudioRecordRules.endReason(cause, elapsed, stopped)
        if (AudioRecordRules.keepsFile(reason)) reason = AudioRecordRules.checked(reason, head(recording.file))
        val folder = recording.file.parentFile
        if (!AudioRecordRules.keepsFile(reason)) {
            folder?.deleteRecursively()
            return Arguments.createMap().apply { putString("reason", reason.name) }
        }
        return Arguments.createMap().apply {
            putString("reason", reason.name)
            putMap("file", copies.keptItem(Kind.FILE, recording.file, recording.name, AudioRecordRules.CONTENT_TYPE, recording.file.length()))
            putDouble("durationMs", AudioRecordRules.durationMs(elapsed, recording.maxDurationMs).toDouble())
        }
    }

    private fun head(file: File): ByteArray = try {
        FileInputStream(file).use { stream -> ByteArray(HEAD_BYTES).let { buffer -> buffer.copyOf(maxOf(stream.read(buffer), 0)) } }
    } catch (e: Exception) {
        ByteArray(0)
    }

    @Suppress("DEPRECATION")
    private fun newRecorder(): MediaRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(reactApplicationContext) else MediaRecorder()

    /**
     * Takes the audio focus for the recording — exclusive, so other apps pause rather than duck — or
     * answers null when it is refused (a call is in progress). Losing it ends the recording as
     * interrupted. A loss that only asks to duck (a notification sound) does not: ducking lowers what
     * this app plays, and a recorder plays nothing.
     */
    private fun requestFocus(): Focus? {
        val audio = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return null
        val listener = AudioManager.OnAudioFocusChangeListener { change ->
            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                // Before API 26 this arrives on the main thread; posting keeps every end on one thread.
                handler.post { end(Cause.INTERRUPTION)?.let(::emit) }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setOnAudioFocusChangeListener(listener, handler)
                .build()
            if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return null
            return Focus { audio.abandonAudioFocusRequest(request) }
        }
        @Suppress("DEPRECATION")
        val granted = audio.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return null
        @Suppress("DEPRECATION")
        return Focus { audio.abandonAudioFocus(listener) }
    }

    private fun emit(ended: WritableMap) {
        val context = reactApplicationContext
        if (!context.hasActiveReactInstance()) return
        try {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(ENDED_EVENT, ended)
        } catch (e: Exception) {
            // The recording already ended; the web's next stop is answered NOT_RECORDING.
            Log.w(TAG, "could not emit the end", e)
        }
    }

    private fun describe(e: Throwable): String = e.message ?: e.javaClass.simpleName
}
