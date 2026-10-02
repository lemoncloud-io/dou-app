package io.chatic.dou.module

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.attach.core.AttachPickRules.Kind
import io.chatic.dou.attach.core.AttachPickRules.Source
import io.chatic.dou.photo.PhotoPreparer
import io.chatic.dou.photo.core.PhotoLibraryCore
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * AttachmentPicker — the system pickers for a chat attachment, the bytes of a picked photo, and the
 * preparation of a picked video.
 *
 * `pick` opens the Photo Picker (images and videos, no permission; androidx falls back to the
 * documents picker on a device without one) or the documents picker, and copies every picked item
 * into `<cache>/attach-pick/<uuid>/`. Every item is answered with its kept file's `file://` URI, so no
 * pick answer carries bytes. A photo is first prepared by [PhotoPreparer] the way the in-app grid
 * prepares one, and the prepared bytes are what is kept; the web then reads them with
 * `readAttachment`, one photo at a time, so at most one photo is ever on the bridge.
 *
 * The copy is not optional. A picker's read grant lasts as long as the screen that received the
 * result: once it closes, the URI stops being readable within seconds, even from this process's own
 * transfer service. So the copy starts from the result callback, while that screen is alive, and the
 * transfer reads only the copy. `takePersistableUriPermission` is not used; a copy needs none.
 *
 * `prepareVideo` does not convert: an MP4 of H.264 with AAC (or no audio) is sent as it is, anything
 * else is `UNSUPPORTED`. It reads the shown size and writes a poster frame beside the video.
 */
class AttachmentPickerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        private const val TAG = "AttachmentPicker"
        private const val KEY_PREFIX = "attachment-picker-"
        private const val COPY_BUFFER = 256 * 1024
    }

    private class Rejection(val code: String, message: String) : Exception(message)

    /** A copy stopped because it passed its kind's limit. */
    private class TooLarge : Exception()

    private data class Limits(val image: Long, val video: Long, val file: Long) {
        fun of(kind: Kind): Long = when (kind) {
            Kind.IMAGE -> image
            Kind.VIDEO -> video
            Kind.FILE -> file
        }
    }

    /** What the picked item's provider says about it. */
    private data class Described(val displayName: String?, val size: Long?, val takenAtMs: Long?)

    // Copies run one at a time, in pick order. Preparing a video and reading a photo back have a
    // thread each, so neither waits behind a pick's copies, nor a photo behind a poster being drawn.
    private val pickExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "attach-pick").apply { isDaemon = true }
    }
    private val videoExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "attach-video").apply { isDaemon = true }
    }
    private val readExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "attach-read").apply { isDaemon = true }
    }

    private val preparer = PhotoPreparer(reactContext)

    /** True from `pick` until its answer — the picker is open or its items are still being copied. */
    private val busy = AtomicBoolean(false)

    /** The open picker's promise; whoever takes it (the result, or the screen going away) settles it. */
    private val waiting = AtomicReference<Promise?>(null)
    private val launcher = AtomicReference<ActivityResultLauncher<*>?>(null)
    private val keySequence = AtomicInteger()

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "AttachmentPicker"

    override fun invalidate() {
        reactApplicationContext.removeLifecycleEventListener(this)
        UiThreadUtil.runOnUiThread { abandonPicker() }
        pickExecutor.shutdown()
        videoExecutor.shutdown()
        readExecutor.shutdown()
        super.invalidate()
    }

    override fun onHostResume() = Unit

    override fun onHostPause() = Unit

    /**
     * The screen that would receive the result is gone, and with it the registration: a result
     * delivered to a recreated screen never reaches this callback. Answering now keeps a later pick
     * from being refused as `BUSY` forever.
     */
    override fun onHostDestroy() {
        abandonPicker()
    }

    private fun abandonPicker() {
        launcher.getAndSet(null)?.unregister()
        waiting.getAndSet(null)?.let { promise ->
            busy.set(false)
            promise.reject("INTERNAL", "the screen closed while the picker was open")
        }
    }

    // --- pick ---

    @ReactMethod
    fun pick(source: String?, selectionLimit: Double, maxBytes: ReadableMap?, promise: Promise) {
        val picked = Source.fromWire(source)
        if (picked == null) {
            promise.reject("INVALID", "source must be media or document")
            return
        }
        val limits = Limits(
            image = maxBytes.number("image"),
            video = maxBytes.number("video"),
            file = maxBytes.number("file"),
        )
        val activity = reactApplicationContext.currentActivity as? ComponentActivity
        if (activity == null) {
            promise.reject("INTERNAL", "there is no screen to show the picker on")
            return
        }
        if (!busy.compareAndSet(false, true)) {
            promise.reject("BUSY", "a picker is already open")
            return
        }
        // Every pick sweeps; it runs ahead of this pick's copies on the same thread.
        if (!submit(pickExecutor) { sweep() }) {
            busy.set(false)
            promise.reject("INTERNAL", "the picker is shutting down")
            return
        }
        val limit = AttachPickRules.effectiveLimit(selectionLimit.toInt(), if (picked == Source.MEDIA) systemPickerMax() else null)
        if (limit == 0) {
            busy.set(false)
            promise.resolve(answer(Arguments.createArray(), Arguments.createArray()))
            return
        }
        waiting.set(promise)
        UiThreadUtil.runOnUiThread { open(activity, picked, limit, limits) }
    }

    /**
     * The system Photo Picker's own ceiling on API 33+, where it always exists. Below that androidx
     * uses the picker an SDK extension provides (the same ceiling, far above ten) or the documents
     * picker, which takes no limit.
     */
    private fun systemPickerMax(): Int? =
        if (Build.VERSION.SDK_INT >= 33) MediaStore.getPickImagesMaxLimit() else null

    private fun open(activity: ComponentActivity, source: Source, limit: Int, limits: Limits) {
        if (waiting.get() == null) return
        val pickedAtMs = System.currentTimeMillis()
        val onResult: (List<Uri>) -> Unit = { uris ->
            launcher.getAndSet(null)?.unregister()
            val promise = waiting.getAndSet(null)
            if (promise != null) {
                val chosen = AttachPickRules.withinLimit(uris, limit)
                // Started here, while the screen that holds the read grant is alive.
                val started = submit(pickExecutor) {
                    try {
                        promise.resolve(copyAll(chosen, source, limits, pickedAtMs))
                    } catch (e: Throwable) {
                        Log.w(TAG, "pick failed: ${e.javaClass.simpleName}")
                        promise.reject("INTERNAL", e.message ?: "the picked items could not be read")
                    } finally {
                        busy.set(false)
                    }
                }
                if (!started) {
                    busy.set(false)
                    promise.reject("INTERNAL", "the picker is shutting down")
                }
            }
        }
        val registry = activity.activityResultRegistry
        val key = KEY_PREFIX + keySequence.incrementAndGet()
        try {
            when (source) {
                Source.MEDIA -> {
                    val request = PickVisualMediaRequest.Builder()
                        .setMediaType(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
                        .build()
                    if (AttachPickRules.picksOne(limit)) {
                        registry.register(key, ActivityResultContracts.PickVisualMedia()) { uri -> onResult(listOfNotNull(uri)) }
                            .also { launcher.set(it) }.launch(request)
                    } else {
                        registry.register(key, ActivityResultContracts.PickMultipleVisualMedia(limit)) { uris -> onResult(uris) }
                            .also { launcher.set(it) }.launch(request)
                    }
                }
                Source.DOCUMENT -> {
                    val types = AttachPickRules.DOCUMENT_MIME_TYPES.toTypedArray()
                    if (AttachPickRules.picksOne(limit)) {
                        registry.register(key, ActivityResultContracts.OpenDocument()) { uri -> onResult(listOfNotNull(uri)) }
                            .also { launcher.set(it) }.launch(types)
                    } else {
                        registry.register(key, ActivityResultContracts.OpenMultipleDocuments()) { uris -> onResult(uris) }
                            .also { launcher.set(it) }.launch(types)
                    }
                }
            }
        } catch (e: Exception) {
            // No app answers the intent (a device without a documents UI), or the screen is finishing.
            Log.w(TAG, "could not open the picker: ${e.javaClass.simpleName}")
            launcher.getAndSet(null)?.unregister()
            waiting.getAndSet(null)?.let { promise ->
                busy.set(false)
                promise.reject("INTERNAL", "the picker could not be opened")
            }
        }
    }

    // --- Copying what was picked ---

    private fun copyAll(uris: List<Uri>, source: Source, limits: Limits, pickedAtMs: Long): WritableMap {
        val items = Arguments.createArray()
        val refused = Arguments.createArray()
        for (uri in uris) copyOne(uri, source, limits, pickedAtMs, items, refused)
        return answer(items, refused)
    }

    private fun copyOne(uri: Uri, source: Source, limits: Limits, pickedAtMs: Long, items: WritableArray, refused: WritableArray) {
        val described = describe(uri)
        val mimeType = try {
            reactApplicationContext.contentResolver.getType(uri)
        } catch (e: Exception) {
            null
        }
        val kind = AttachPickRules.kindOf(source, mimeType)
        val fallback = when (kind) {
            Kind.IMAGE -> "photo"
            Kind.VIDEO -> "video"
            Kind.FILE -> "file"
        }
        val name = AttachPickRules.pickedName(
            AttachPickRules.safeName(described.displayName, fallback),
            kind,
            described.takenAtMs,
            pickedAtMs,
            TimeZone.getDefault(),
        )
        val folder = File(File(reactApplicationContext.cacheDir, AttachPickRules.FOLDER), UUID.randomUUID().toString())
        try {
            keep(uri, folder, name, kind, mimeType, described, limits, items, refused)
        } catch (e: OutOfMemoryError) {
            // A photo too large to decode; whatever was written for it goes too.
            Log.w(TAG, "a picked item ran out of memory")
            folder.deleteRecursively()
            refused.pushMap(refusal(name, kind, "too-large"))
        } catch (e: Throwable) {
            // Fails the whole pick, as before; the half-kept item does not wait for the sweep.
            folder.deleteRecursively()
            throw e
        }
    }

    /**
     * Copies one picked item into [folder] and keeps what is sent: a video or document as copied, a
     * photo as [PhotoPreparer] made it, the raw copy removed when the prepared file's name differs.
     * Every refusal leaves no folder behind.
     */
    private fun keep(
        uri: Uri,
        folder: File,
        name: String,
        kind: Kind,
        mimeType: String?,
        described: Described,
        limits: Limits,
        items: WritableArray,
        refused: WritableArray,
    ) {
        val limit = limits.of(kind)
        val export = if (kind == Kind.IMAGE) PhotoLibraryCore.export(mimeType) else null
        // What is sent as stored is held to its limit before a byte is copied. A photo written as
        // JPEG is judged by what the conversion makes instead.
        val storedIsSent = export == null || PhotoLibraryCore.sendsStoredBytes(export)
        val copyLimit = if (storedIsSent) limit else 0L
        if (described.size != null && AttachPickRules.exceeds(described.size, copyLimit)) {
            refused.pushMap(refusal(name, kind, "too-large"))
            return
        }

        val copy = File(folder, name)
        val size = try {
            if (!folder.mkdirs()) throw IOException("cannot create the copy folder")
            copyInto(uri, copy, copyLimit)
        } catch (e: TooLarge) {
            folder.deleteRecursively()
            refused.pushMap(refusal(name, kind, "too-large"))
            return
        } catch (e: Exception) {
            // A grant that lapsed (SecurityException), a provider that failed, a full disk.
            Log.w(TAG, "copy failed: ${e.javaClass.simpleName}")
            folder.deleteRecursively()
            refused.pushMap(refusal(name, kind, "unreadable"))
            return
        }

        if (export == null) {
            items.pushMap(Arguments.createMap().apply {
                putString("kind", kind.wire)
                putString("uri", Uri.fromFile(copy).toString())
                putString("name", name)
                putString("contentType", AttachPickRules.contentType(mimeType))
                putDouble("size", size.toDouble())
            })
            return
        }

        // A photo is kept as prepared: the bytes the web reads back are the bytes that go up.
        val prepared = preparer.prepare(Uri.fromFile(copy), export, 0, 0)
        if (prepared == null) {
            folder.deleteRecursively()
            refused.pushMap(refusal(name, kind, "unsupported"))
            return
        }
        if (AttachPickRules.exceeds(prepared.bytes.size.toLong(), limit)) {
            folder.deleteRecursively()
            refused.pushMap(refusal(name, kind, "too-large"))
            return
        }
        val fileName = PhotoLibraryCore.fileName(name, prepared.extension)
        val kept = File(folder, fileName)
        try {
            kept.writeBytes(prepared.bytes)
            if (kept.name != copy.name) copy.delete()
        } catch (e: Exception) {
            Log.w(TAG, "keeping the prepared photo failed: ${e.javaClass.simpleName}")
            folder.deleteRecursively()
            refused.pushMap(refusal(name, kind, "unreadable"))
            return
        }
        val (width, height) = imageSize(prepared.bytes)
        items.pushMap(Arguments.createMap().apply {
            putString("kind", Kind.IMAGE.wire)
            putString("uri", Uri.fromFile(kept).toString())
            putString("name", fileName)
            putString("contentType", prepared.mimeType)
            putDouble("size", kept.length().toDouble())
            putInt("width", width)
            putInt("height", height)
        })
    }

    /** The provider's name, size and capture time. A column it does not serve is left null. */
    private fun describe(uri: Uri): Described {
        val resolver = reactApplicationContext.contentResolver
        var name: String? = null
        var size: Long? = null
        try {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn)
                    if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn).takeIf { it >= 0 }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "describe failed: ${e.javaClass.simpleName}")
        }
        // Asked apart: a documents provider may refuse a column it does not have.
        val takenAt = try {
            resolver.query(uri, arrayOf(MediaStore.Images.ImageColumns.DATE_TAKEN), null, null, null)?.use { cursor ->
                val column = cursor.getColumnIndex(MediaStore.Images.ImageColumns.DATE_TAKEN)
                if (cursor.moveToFirst() && column >= 0 && !cursor.isNull(column)) cursor.getLong(column) else null
            }
        } catch (e: Exception) {
            null
        }
        return Described(name, size, takenAt)
    }

    /** Streams [uri] into [target]; stops with [TooLarge] once more than [limit] bytes came (0: no limit). */
    private fun copyInto(uri: Uri, target: File, limit: Long): Long {
        val input = reactApplicationContext.contentResolver.openInputStream(uri) ?: throw IOException("the provider gave no stream")
        return input.use { stream ->
            target.outputStream().use { out ->
                val buffer = ByteArray(COPY_BUFFER)
                var total = 0L
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    total += read
                    if (AttachPickRules.exceeds(total, limit)) throw TooLarge()
                    out.write(buffer, 0, read)
                }
                total
            }
        }
    }

    /** The prepared image's size as shown: its pixels, turned by an EXIF orientation it kept. */
    private fun imageSize(bytes: ByteArray): Pair<Int, Int> {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        val rotation = try {
            ExifInterface(ByteArrayInputStream(bytes)).rotationDegrees
        } catch (e: Exception) {
            0
        }
        return AttachPickRules.displaySize(maxOf(bounds.outWidth, 0), maxOf(bounds.outHeight, 0), rotation)
    }

    private fun sweep() {
        try {
            val root = File(reactApplicationContext.cacheDir, AttachPickRules.FOLDER)
            val folders = root.listFiles()?.filter { it.isDirectory } ?: return
            val ages = folders.map { folder ->
                AttachPickRules.Folder(folder.name, folder.lastModified(), folder.listFiles()?.map { it.lastModified() }.orEmpty())
            }
            for (name in AttachPickRules.foldersToSweep(ages, System.currentTimeMillis())) {
                File(root, name).deleteRecursively()
            }
        } catch (e: Exception) {
            Log.w(TAG, "sweep failed: ${e.javaClass.simpleName}")
        }
    }

    private fun refusal(name: String, kind: Kind, reason: String): WritableMap = Arguments.createMap().apply {
        putString("name", name)
        putString("kind", kind.wire)
        putString("reason", reason)
    }

    private fun answer(items: WritableArray, refused: WritableArray): WritableMap = Arguments.createMap().apply {
        putArray("items", items)
        putArray("refused", refused)
    }

    // --- readAttachment ---

    /**
     * The bytes of one photo [pick] kept, in the shape `PhotoLibrary.readPhoto` answers. The file is
     * already prepared, so it is read as it is; nothing here needs a permission.
     */
    @ReactMethod
    fun readAttachment(uri: String?, promise: Promise) {
        val started = submit(readExecutor) {
            try {
                promise.resolve(read(uri))
            } catch (rejection: Rejection) {
                promise.reject(rejection.code, rejection.message)
            } catch (e: Throwable) {
                // OutOfMemoryError included: a failed read fails this photo, not the app.
                Log.w(TAG, "readAttachment failed: ${e.javaClass.simpleName}")
                promise.reject("INTERNAL", e.message ?: "the photo could not be read")
            }
        }
        if (!started) promise.reject("INTERNAL", "the picker is shutting down")
    }

    private fun read(uri: String?): WritableMap {
        val file = pickedFile(uri)
        val bytes = try {
            file.readBytes()
        } catch (e: IOException) {
            // Gone between the check and the read: the sweep, or the OS clearing its cache.
            if (!file.exists()) throw Rejection("SOURCE", "the picked file no longer exists")
            throw e
        }
        val (width, height) = imageSize(bytes)
        return Arguments.createMap().apply {
            putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            putString("mimeType", AttachPickRules.imageMimeType(file.name))
            putString("fileName", file.name)
            putInt("width", width)
            putInt("height", height)
        }
    }

    /** The picked file [uri] names, or the rejection `readAttachment` and `prepareVideo` share. */
    private fun pickedFile(uri: String?): File {
        val root = File(reactApplicationContext.cacheDir, AttachPickRules.FOLDER)
        return when (val check = AttachPickRules.checkPicked(uri, root)) {
            is AttachPickRules.PickedCheck.Accepted -> check.file
            is AttachPickRules.PickedCheck.Invalid -> throw Rejection("INVALID", "not a picked file: ${check.reason}")
            AttachPickRules.PickedCheck.Missing -> throw Rejection("SOURCE", "the picked file no longer exists")
        }
    }

    // --- prepareVideo ---

    @ReactMethod
    fun prepareVideo(uri: String?, promise: Promise) {
        val started = submit(videoExecutor) {
            try {
                promise.resolve(prepare(uri))
            } catch (rejection: Rejection) {
                promise.reject(rejection.code, rejection.message)
            } catch (e: Throwable) {
                // OutOfMemoryError included: a failed preparation fails this video, not the app.
                Log.w(TAG, "prepareVideo failed: ${e.javaClass.simpleName}")
                promise.reject("SYSTEM", e.message ?: "the video could not be prepared")
            }
        }
        if (!started) promise.reject("SYSTEM", "the picker is shutting down")
    }

    private fun prepare(uri: String?): WritableMap {
        val file = pickedFile(uri)
        val head = try {
            FileInputStream(file).use { stream -> ByteArray(12).let { buffer -> buffer.copyOf(maxOf(stream.read(buffer), 0)) } }
        } catch (e: IOException) {
            throw Rejection("SOURCE", "the picked file cannot be read")
        }
        if (!AttachPickRules.isMp4Container(head)) throw Rejection("UNSUPPORTED", "the video is not an MP4")

        val extractor = MediaExtractor()
        val video: MediaFormat
        try {
            try {
                extractor.setDataSource(file.path)
            } catch (e: IOException) {
                throw Rejection("UNSUPPORTED", "the video cannot be read as an MP4")
            }
            val formats = (0 until extractor.trackCount).map { extractor.getTrackFormat(it) }
            val check = AttachPickRules.checkTracks(formats.map { it.getString(MediaFormat.KEY_MIME) })
            if (check is AttachPickRules.TrackCheck.Refused) throw Rejection("UNSUPPORTED", check.reason)
            video = formats.first { it.getString(MediaFormat.KEY_MIME)?.lowercase() == AttachPickRules.VIDEO_AVC }
        } finally {
            extractor.release()
        }

        val durationUs = if (video.containsKey(MediaFormat.KEY_DURATION)) video.getLong(MediaFormat.KEY_DURATION) else null
        val retriever = MediaMetadataRetriever()
        try {
            val readable = try {
                retriever.setDataSource(file.path)
                true
            } catch (e: Exception) {
                false
            }
            val rotation = when {
                video.containsKey(MediaFormat.KEY_ROTATION) -> video.getInteger(MediaFormat.KEY_ROTATION)
                readable -> retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
                else -> 0
            }
            val (width, height) = AttachPickRules.displaySize(
                video.getInteger(MediaFormat.KEY_WIDTH),
                video.getInteger(MediaFormat.KEY_HEIGHT),
                rotation,
            )
            val poster = if (readable) poster(retriever, file, durationUs) else null
            return Arguments.createMap().apply {
                putMap("file", Arguments.createMap().apply {
                    putString("uri", Uri.fromFile(file).toString())
                    putString("name", AttachPickRules.mp4Name(file.name))
                    putString("contentType", "video/mp4")
                    putDouble("size", file.length().toDouble())
                    putInt("width", width)
                    putInt("height", height)
                })
                if (poster != null) putMap("poster", poster) else putNull("poster")
            }
        } finally {
            try {
                retriever.release()
            } catch (e: Exception) {
                // Nothing left to do with it.
            }
        }
    }

    /**
     * The frame at half a second (the first, for a shorter video), at most 400 px on its long side,
     * as a JPEG of at most 200 KB written beside the video. Null when no frame can be read or no
     * quality fits: the video is still sent, without one.
     */
    private fun poster(retriever: MediaMetadataRetriever, video: File, durationUs: Long?): WritableMap? = try {
        val frame = frameAt(retriever, AttachPickRules.posterTimeUs(durationUs))
            ?: frameAt(retriever, 0L)
        frame?.let { bitmap ->
            val scaled = AttachPickRules.posterSize(bitmap.width, bitmap.height).let { (width, height) ->
                if (width == bitmap.width && height == bitmap.height) bitmap else Bitmap.createScaledBitmap(bitmap, width, height, true)
            }
            if (scaled !== bitmap) bitmap.recycle()
            val jpeg = AttachPickRules.POSTER_QUALITIES.asSequence()
                .map { quality -> preparer.encodeJpeg(scaled, quality) }
                .firstOrNull { it.size <= AttachPickRules.POSTER_MAX_BYTES }
            val width = scaled.width
            val height = scaled.height
            scaled.recycle()
            jpeg?.let { bytes ->
                val file = File(video.parentFile, AttachPickRules.posterName(video.name))
                file.writeBytes(bytes)
                Arguments.createMap().apply {
                    putString("uri", Uri.fromFile(file).toString())
                    putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    putString("contentType", "image/jpeg")
                    putDouble("size", bytes.size.toDouble())
                    putInt("width", width)
                    putInt("height", height)
                }
            }
        }
    } catch (e: Throwable) {
        Log.w(TAG, "poster failed: ${e.javaClass.simpleName}")
        null
    }

    /**
     * One frame, upright. API 27+ decodes it straight at poster size, inside a square box so the
     * rotation cannot put the long side on the wrong axis; before that the full frame is decoded and
     * scaled afterwards.
     */
    private fun frameAt(retriever: MediaMetadataRetriever, timeUs: Long): Bitmap? = try {
        val edge = AttachPickRules.POSTER_MAX_EDGE
        if (Build.VERSION.SDK_INT >= 27) {
            retriever.getScaledFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST, edge, edge)
        } else {
            retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
        }
    } catch (e: Exception) {
        null
    }

    // --- Internals ---

    /** Runs [task] on [executor]; false when the executor is gone (after a React reload). */
    private fun submit(executor: ExecutorService, task: () -> Unit): Boolean = try {
        executor.execute(task)
        true
    } catch (e: RejectedExecutionException) {
        false
    }

    private fun ReadableMap?.number(key: String): Long =
        if (this != null && hasKey(key) && getType(key) == ReadableType.Number) getDouble(key).toLong() else 0L
}
