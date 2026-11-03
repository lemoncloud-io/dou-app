package io.chatic.dou.attach

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.attach.core.AttachPickRules.Kind
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.util.UUID

/**
 * Keeping a copy in `<cache>/attach-pick/<uuid>/`, shared by the attachment picker and the photo
 * library's `keepLibraryVideo`: a new pick folder, what the provider says about a URI, the copy
 * itself, the check that a copied video is sent as it is (the library's) or the judgement of what a
 * video needs (the picker's: as it is, or converted), and the answer a kept video or document gets. A library video therefore lands where a picked one does, under the same rules, so
 * `PrepareVideo`, the sweep and the upload rule take it without knowing where it came from.
 */
class PickedCopies(private val context: Context) {

    companion object {
        private const val TAG = "PickedCopies"
        private const val COPY_BUFFER = 256 * 1024
    }

    /** What the item's provider says about it. A column it does not serve is left null. */
    data class Described(val displayName: String?, val size: Long?, val takenAtMs: Long?)

    /** How a [copy] ended. Every outcome but [Kept] leaves no folder behind. */
    sealed class Copied {
        data class Kept(val file: File, val size: Long) : Copied()

        /** Over its limit — by the provider's size before a byte was copied, or while copying. */
        object TooLarge : Copied()

        /** A grant that lapsed (SecurityException), a provider that failed, a full disk. */
        object Unreadable : Copied()
    }

    /** What [checkVideo] found in a copied video. */
    sealed class VideoCheck {
        /** An MP4 of one H.264 track and AAC or no audio; [video] is that H.264 track's format. */
        data class Sendable(val video: MediaFormat) : VideoCheck()

        data class Unsupported(val reason: String) : VideoCheck()

        /** The copy could not be opened at all — it was swept, or the cache was cleared. */
        object Unreadable : VideoCheck()
    }

    /** What [inspectVideo] found in a video. */
    sealed class VideoInspection {
        /** The container opened and its tracks were read. [verdict] is what the video needs; [tracks] are their formats. */
        data class Readable(val verdict: AttachPickRules.VideoVerdict, val tracks: List<MediaFormat>) : VideoInspection() {
            /** The first track that is video by its type, or null — a codec the extractor cannot name is not one. */
            val video: MediaFormat? get() = tracks.firstOrNull { it.getString(MediaFormat.KEY_MIME)?.lowercase()?.startsWith("video/") == true }
        }

        /** The file or the provider could not be opened at all — swept, cleared, or a grant that lapsed. */
        object Unreadable : VideoInspection()

        /** It opened, but the extractor reads no container in it. */
        object Unrecognised : VideoInspection()
    }

    /** How [keepVideo] ended. Every outcome but [AsIs] and [ToConvert] leaves no folder behind. */
    sealed class KeptVideo {
        /** An MP4 of H.264 and AAC (or no audio), within the video ceiling: sent as copied. */
        data class AsIs(val file: File, val size: Long) : KeptVideo()

        /** A video the conversion makes sendable; its size is what it is stored at, not what goes up. */
        data class ToConvert(val file: File, val size: Long) : KeptVideo()

        /** A video that goes up as it is, over the ceiling. */
        object TooLarge : KeptVideo()

        /** Could not be copied, or could not be read as a video container. */
        object Unreadable : KeptVideo()
    }

    /** A copy stopped because it passed its limit. */
    private class OverLimit : Exception()

    /**
     * Deletes the pick folders untouched for a day ([AttachPickRules.foldersToSweep]). Every writer of
     * `attach-pick` runs it before it writes — the attachment picker's pick, the photo grid's
     * `keepLibraryVideo` and the voice recorder's start — so a person who sends only from one of them
     * does not pile up copies. Never fails its caller: a folder it cannot delete waits for the next sweep.
     */
    fun sweep() {
        try {
            val root = File(context.cacheDir, AttachPickRules.FOLDER)
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

    /** A new, not yet created folder for one item: one folder each, so two items of one name never meet. */
    fun newFolder(): File = File(File(context.cacheDir, AttachPickRules.FOLDER), UUID.randomUUID().toString())

    /** The provider's name, size and capture time. */
    fun describe(uri: Uri): Described {
        val resolver = context.contentResolver
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

    /**
     * Copies [uri] into [folder] as [name], held to [limit] (0: none). What is sent as stored is held
     * to its limit before a byte is copied when the provider says its size ([knownSize]), and again
     * while copying, since a provider's size can be missing or wrong.
     */
    fun copy(uri: Uri, folder: File, name: String, knownSize: Long?, limit: Long): Copied {
        if (knownSize != null && AttachPickRules.exceeds(knownSize, limit)) return Copied.TooLarge
        val target = File(folder, name)
        return try {
            if (!folder.mkdirs()) throw IOException("cannot create the copy folder")
            Copied.Kept(target, copyInto(uri, target, limit))
        } catch (e: OverLimit) {
            folder.deleteRecursively()
            Copied.TooLarge
        } catch (e: Exception) {
            Log.w(TAG, "copy failed: ${e.javaClass.simpleName}")
            folder.deleteRecursively()
            Copied.Unreadable
        }
    }

    /** Streams [uri] into [target]; stops with [OverLimit] once more than [limit] bytes came (0: no limit). */
    private fun copyInto(uri: Uri, target: File, limit: Long): Long {
        val input = context.contentResolver.openInputStream(uri) ?: throw IOException("the provider gave no stream")
        return input.use { stream ->
            target.outputStream().use { out ->
                val buffer = ByteArray(COPY_BUFFER)
                var total = 0L
                while (true) {
                    val read = stream.read(buffer)
                    if (read < 0) break
                    total += read
                    if (AttachPickRules.exceeds(total, limit)) throw OverLimit()
                    out.write(buffer, 0, read)
                }
                total
            }
        }
    }

    /**
     * Whether a copied video is sent as it is ([AttachPickRules.isMp4Container], then
     * [AttachPickRules.checkTracks] over its tracks), anything else being [VideoCheck.Unsupported]. The
     * photo library's `keepLibraryVideo` still answers that way; the attachment picker judges with
     * [inspectVideo] instead, which sends such a video to the conversion.
     */
    fun checkVideo(file: File): VideoCheck {
        val head = try {
            FileInputStream(file).use { stream -> ByteArray(12).let { buffer -> buffer.copyOf(maxOf(stream.read(buffer), 0)) } }
        } catch (e: IOException) {
            return VideoCheck.Unreadable
        }
        if (!AttachPickRules.isMp4Container(head)) return VideoCheck.Unsupported("the video is not an MP4")

        val extractor = MediaExtractor()
        try {
            try {
                extractor.setDataSource(file.path)
            } catch (e: IOException) {
                return VideoCheck.Unsupported("the video cannot be read as an MP4")
            }
            val formats = (0 until extractor.trackCount).map { extractor.getTrackFormat(it) }
            val check = AttachPickRules.checkTracks(formats.map { it.getString(MediaFormat.KEY_MIME) })
            if (check is AttachPickRules.TrackCheck.Refused) return VideoCheck.Unsupported(check.reason)
            return VideoCheck.Sendable(formats.first { it.getString(MediaFormat.KEY_MIME)?.lowercase() == AttachPickRules.VIDEO_AVC })
        } finally {
            extractor.release()
        }
    }

    /**
     * What a video file needs: sent as it is, or converted ([AttachPickRules.judgeVideo]). The same
     * judgement the pick makes after copying and `PrepareVideo` makes before converting.
     */
    fun inspectVideo(file: File): VideoInspection {
        val head = try {
            FileInputStream(file).use { stream -> readHead(stream) }
        } catch (e: IOException) {
            return VideoInspection.Unreadable
        }
        return inspect(head) { extractor -> extractor.setDataSource(file.path) }
    }

    /**
     * The same judgement of a video still at its provider, before a byte is copied: the one thing that
     * decides whether a video over the ceiling is refused or converted. Only the picker's callback may
     * call it — the provider's grant lasts as long as the screen that received the result.
     */
    fun inspectVideo(uri: Uri): VideoInspection {
        val resolver = context.contentResolver
        val head = try {
            resolver.openInputStream(uri)?.use { stream -> readHead(stream) } ?: return VideoInspection.Unreadable
        } catch (e: Exception) {
            return VideoInspection.Unreadable
        }
        return inspect(head) { extractor ->
            val descriptor = resolver.openFileDescriptor(uri, "r") ?: throw IOException("the provider gave no descriptor")
            descriptor.use { extractor.setDataSource(it.fileDescriptor) }
        }
    }

    private fun readHead(stream: java.io.InputStream): ByteArray {
        val buffer = ByteArray(12)
        var total = 0
        while (total < buffer.size) {
            val read = stream.read(buffer, total, buffer.size - total)
            if (read < 0) break
            total += read
        }
        return buffer.copyOf(total)
    }

    private fun inspect(head: ByteArray, open: (MediaExtractor) -> Unit): VideoInspection {
        val extractor = MediaExtractor()
        try {
            try {
                open(extractor)
            } catch (e: SecurityException) {
                return VideoInspection.Unreadable
            } catch (e: Exception) {
                // An IOException from a container it does not read; some builds throw a runtime
                // exception for a header they cannot parse.
                return VideoInspection.Unrecognised
            }
            val formats = (0 until extractor.trackCount).map { extractor.getTrackFormat(it) }
            val verdict = AttachPickRules.judgeVideo(head, formats.map { it.getString(MediaFormat.KEY_MIME) })
            return VideoInspection.Readable(verdict, formats)
        } finally {
            extractor.release()
        }
    }

    /**
     * Copies a video into [folder] as [name] and judges it. A video that will be converted is not held
     * to the ceiling — its size is decided after the conversion — so the copy has no limit; one that
     * goes up as it is, is. When the provider says the video is over the ceiling, its tracks are read
     * first, from the provider, and an as-is video is refused without copying a byte, as before.
     */
    fun keepVideo(uri: Uri, folder: File, name: String, knownSize: Long?, limit: Long): KeptVideo {
        if (knownSize != null && AttachPickRules.exceeds(knownSize, limit)) {
            when (val found = inspectVideo(uri)) {
                is VideoInspection.Readable -> if (found.verdict is AttachPickRules.VideoVerdict.AsIs) return KeptVideo.TooLarge
                else -> return KeptVideo.Unreadable
            }
        }
        val kept = when (val copied = copy(uri, folder, name, knownSize, 0L)) {
            is Copied.Kept -> copied
            Copied.TooLarge, Copied.Unreadable -> return KeptVideo.Unreadable
        }
        return when (val found = inspectVideo(kept.file)) {
            is VideoInspection.Readable -> when (found.verdict) {
                AttachPickRules.VideoVerdict.AsIs -> {
                    if (AttachPickRules.exceeds(kept.size, limit)) {
                        folder.deleteRecursively()
                        KeptVideo.TooLarge
                    } else {
                        KeptVideo.AsIs(kept.file, kept.size)
                    }
                }
                is AttachPickRules.VideoVerdict.NeedsExport -> KeptVideo.ToConvert(kept.file, kept.size)
            }
            else -> {
                folder.deleteRecursively()
                KeptVideo.Unreadable
            }
        }
    }

    /** The answer for a video or document kept as copied — the item `PickAttachments` lists. */
    fun keptItem(kind: Kind, file: File, name: String, mimeType: String?, size: Long, needsExport: Boolean = false): WritableMap =
        Arguments.createMap().apply {
            putString("kind", kind.wire)
            putString("uri", Uri.fromFile(file).toString())
            putString("name", name)
            putString("contentType", AttachPickRules.contentType(mimeType))
            putDouble("size", size.toDouble())
            if (needsExport) putBoolean("needsExport", true)
        }
}
