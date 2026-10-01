package io.chatic.dou.attach.core

import java.io.File
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import java.nio.file.InvalidPathException
import java.nio.file.Paths
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The rules of the attachment picker that need no Android framework: which picker to open and with
 * what limit, what a picked item is, what its copy is called, which file a later request may name, when
 * an old copy is swept, which videos are sent as they are, and the poster's size and encoding steps. Kept apart so plain JVM tests cover
 * them; the pickers, the copies, MediaExtractor and MediaMetadataRetriever live in
 * [io.chatic.dou.module.AttachmentPickerModule].
 *
 * Layout, under the app's cache directory — one folder per picked item, so two items of the same name
 * never meet, and a video's poster sits beside it:
 * ```
 * attach-pick/
 *   ├ <uuid>/
 *   │   ├ video-20261001-093000.mp4   the copy the web uploads from
 *   │   └ poster.jpg                  written by PrepareVideo
 *   └ <uuid>/
 *       └ IMG_0001.jpg                a prepared photo, read back with ReadAttachment
 * ```
 */
object AttachPickRules {

    /** The copies' folder under the cache directory. The upload-source rule names it too. */
    const val FOLDER = "attach-pick"

    /** A copy folder untouched for longer than this is swept at the next pick. */
    const val SWEEP_AGE_MS = 24L * 60 * 60 * 1000

    /**
     * What the documents picker offers: the server's seven document formats, the labels Hancom's own
     * tools give HWP and HWPX, and `application/octet-stream` — most systems do not know HWP, and a
     * file they do not know is offered under that type or not at all.
     */
    val DOCUMENT_MIME_TYPES = listOf(
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/x-hwp",
        "application/haansofthwp",
        "application/vnd.hancom.hwp",
        "application/hwp+zip",
        "application/vnd.hancom.hwpx",
        "application/haansofthwpx",
        "text/plain",
        "application/octet-stream",
    )

    const val OCTET_STREAM = "application/octet-stream"

    // ---- Picker -------------------------------------------------------------------------------

    enum class Source(val wire: String) {
        MEDIA("media"),
        DOCUMENT("document");

        companion object {
            fun fromWire(value: String?): Source? = entries.firstOrNull { it.wire == value }
        }
    }

    /**
     * How many items the picker may return: the message's remaining slots, capped by what the system
     * Photo Picker accepts ([systemMax], null when there is no system picker or it cannot say).
     * androidx refuses a limit above the system's; the documents picker takes no limit at all, which
     * is why its result is cut to this after the fact.
     */
    fun effectiveLimit(selectionLimit: Int, systemMax: Int?): Int {
        if (selectionLimit <= 0) return 0
        return if (systemMax != null && systemMax > 0) minOf(selectionLimit, systemMax) else selectionLimit
    }

    /** androidx's multiple-pick contract refuses a limit of one, so a single slot uses the single picker. */
    fun picksOne(limit: Int): Boolean = limit == 1

    /** Picked items past [limit] — a documents picker that ignores the limit — are dropped. */
    fun <T> withinLimit(picked: List<T>, limit: Int): List<T> = picked.take(maxOf(limit, 0))

    // ---- What a picked item is ------------------------------------------------------------------

    enum class Kind(val wire: String) {
        IMAGE("image"),
        VIDEO("video"),
        FILE("file"),
    }

    /**
     * A media pick is a photo when its type says so and a video otherwise — the system picker and its
     * documents fallback offer nothing else, and a video of a type the shell cannot name is still the
     * web's to judge. A documents pick is a file whatever it is.
     */
    fun kindOf(source: Source, mimeType: String?): Kind = when (source) {
        Source.DOCUMENT -> Kind.FILE
        Source.MEDIA -> if (mimeType?.lowercase()?.startsWith("image/") == true) Kind.IMAGE else Kind.VIDEO
    }

    /** The content type to report: as the OS declared it, or `application/octet-stream` when it does not know. */
    fun contentType(declared: String?): String = declared?.trim()?.takeIf { it.isNotEmpty() } ?: OCTET_STREAM

    /** Whether a [size] is over its kind's [limit]. A limit of zero or less means none was given. */
    fun exceeds(size: Long, limit: Long): Boolean = limit > 0 && size > limit

    // ---- Names ----------------------------------------------------------------------------------

    /** The largest name, in UTF-8 bytes, a copy is written under; file systems stop at 255. */
    const val MAX_NAME_BYTES = 200

    /**
     * A picked file's name as the copy keeps it and the web is told: the last path segment, without
     * control characters, trimmed of spaces, and short enough for any file system (the base is cut, the
     * extension kept). Everything else stays — `minutes v1.2.pdf` is sent under that name.
     */
    fun safeName(name: String?, fallback: String): String {
        val segment = name.orEmpty().substringAfterLast('/').substringAfterLast('\\')
        val cleaned = buildString {
            segment.codePoints().forEach { codePoint -> if (codePoint >= 0x20 && codePoint !in 0x7F..0x9F) appendCodePoint(codePoint) }
        }.trim()
        if (cleaned.isEmpty() || cleaned == "." || cleaned == "..") return fallback
        if (cleaned.toByteArray(Charsets.UTF_8).size <= MAX_NAME_BYTES) return cleaned
        val dot = cleaned.lastIndexOf('.')
        val extension = if (dot > 0 && cleaned.length - dot <= 11) cleaned.substring(dot) else ""
        val base = if (extension.isEmpty()) cleaned else cleaned.substring(0, dot)
        val budget = MAX_NAME_BYTES - extension.toByteArray(Charsets.UTF_8).size
        return cutUtf8(base, budget).trim().ifEmpty { fallback.substringBeforeLast('.') } + extension
    }

    /**
     * The Photo Picker names an item after its media id (`1000000123.mp4`), which tells the person
     * nothing. A name that is digits only is replaced with `video-<yyyyMMdd-HHmmss>` or
     * `photo-<…>`, by when it was taken, else when it was picked, in the device's time zone. Any other
     * name — the documents picker gives the real one — is kept.
     */
    fun pickedName(name: String, kind: Kind, takenAtMs: Long?, pickedAtMs: Long, zone: TimeZone): String {
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        if (base.isEmpty() || !base.all { it in '0'..'9' }) return name
        val extension = if (dot > 0) name.substring(dot) else ""
        val prefix = if (kind == Kind.IMAGE) "photo" else "video"
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).apply { timeZone = zone }
            .format(Date(takenAtMs?.takeIf { it > 0 } ?: pickedAtMs))
        return "$prefix-$stamp$extension"
    }

    /** The name a prepared video is sent under: the picked one with its extension changed to `.mp4`. */
    fun mp4Name(name: String): String {
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        return "${base.ifEmpty { "video" }}.mp4"
    }

    /** The poster's name beside its video: `poster.jpg`, unless that is the video's own name. */
    fun posterName(videoName: String): String = if (videoName == "poster.jpg") "poster (1).jpg" else "poster.jpg"

    // ---- Which file a request may name ---------------------------------------------------------

    /** What [checkPicked] found. */
    sealed class PickedCheck {
        /** A file at `attach-pick/<uuid>/<file>`. [file] is the resolved real file. */
        data class Accepted(val file: File) : PickedCheck()

        /** Not a picked file: no URI, another scheme, a `..`, outside the folder, or at the wrong depth. */
        data class Invalid(val reason: String) : PickedCheck()

        /** At the right place, but gone — the sweep or the OS cleared it. */
        object Missing : PickedCheck()
    }

    /**
     * The picked file a `PrepareVideo` or `ReadAttachment` URI names, under [root] (the
     * `attach-pick` folder). Only a file exactly one pick folder down is accepted — what a pick wrote,
     * and where a video's results are written beside it. A file directly in `attach-pick/` or deeper
     * than one folder is not something a pick made, so it is refused, as iOS refuses it.
     *
     * The path is judged twice: as written, normalised (a `..` segment is refused outright rather than
     * resolved), and again after links are resolved, so a symbolic link cannot point out of its folder.
     */
    fun checkPicked(uri: String?, root: File): PickedCheck {
        if (uri.isNullOrBlank()) return PickedCheck.Invalid("uri is required")
        val parsed = try {
            URI(uri)
        } catch (_: URISyntaxException) {
            return PickedCheck.Invalid("not a URI")
        }
        if (!parsed.scheme.equals("file", ignoreCase = true)) return PickedCheck.Invalid("only file:// URIs are accepted")
        if (!parsed.host.isNullOrEmpty()) return PickedCheck.Invalid("a file URI must not name a host")
        val path = parsed.path?.takeIf { it.startsWith("/") } ?: return PickedCheck.Invalid("the path is not absolute")
        if ('\u0000' in path || uri.contains("%00", ignoreCase = true)) return PickedCheck.Invalid("the path holds a NUL character")
        if (path.split('/').any { it == ".." }) return PickedCheck.Invalid("the path holds a .. segment")

        val lexical = try {
            Paths.get(path).normalize().toString()
        } catch (_: InvalidPathException) {
            return PickedCheck.Invalid("the path cannot be read")
        }
        if (!isPickedPath(lexical, Paths.get(root.path).normalize().toString())) {
            return PickedCheck.Invalid("not a file at $FOLDER/<uuid>/<file>")
        }
        val file = File(lexical)
        if (!file.exists()) return PickedCheck.Missing
        val real = try {
            file.canonicalFile
        } catch (_: IOException) {
            return PickedCheck.Invalid("the path cannot be resolved")
        }
        val realRoot = try {
            root.canonicalPath
        } catch (_: IOException) {
            return PickedCheck.Invalid("the folder cannot be resolved")
        }
        if (!isPickedPath(real.path, realRoot)) return PickedCheck.Invalid("resolves outside its pick folder")
        if (!real.isFile) return PickedCheck.Invalid("not a file")
        return PickedCheck.Accepted(real)
    }

    /**
     * Whether a normalised absolute [path] is a file exactly one folder below [root]:
     * `<root>/<uuid>/<file>`. A sibling folder whose name only starts like [root] is not inside it.
     */
    fun isPickedPath(path: String, root: String): Boolean {
        val prefix = root.trimEnd('/') + "/"
        if (!path.startsWith(prefix)) return false
        val segments = path.substring(prefix.length).split('/')
        return segments.size == 2 && segments.all { it.isNotEmpty() && it != "." && it != ".." }
    }

    /**
     * A kept photo's type, from its extension — one of the four a prepared photo is written as, and
     * `application/octet-stream` for anything else.
     */
    fun imageMimeType(fileName: String): String = when (fileName.substringAfterLast('.', "").lowercase()) {
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        else -> OCTET_STREAM
    }

    // ---- Sweep ----------------------------------------------------------------------------------

    /**
     * One copy folder as the sweep sees it: the folder's own modification time and its files'. The
     * newest of them counts, so a folder whose video was prepared (a poster written) yesterday evening
     * is kept a day from then, not from the pick.
     */
    data class Folder(val name: String, val modifiedAtMs: Long, val fileModifiedAtMs: List<Long> = emptyList())

    /**
     * The folders to delete: their newest change more than [SWEEP_AGE_MS] before [nowMs]. Nothing else
     * deletes a copy — not the end of an upload, since a failed message is retried from the same copy
     * and a video's poster is sent after the video itself.
     */
    fun foldersToSweep(folders: List<Folder>, nowMs: Long): List<String> =
        folders.filter { folder -> nowMs - (folder.fileModifiedAtMs + folder.modifiedAtMs).max() > SWEEP_AGE_MS }.map { it.name }

    // ---- Video ----------------------------------------------------------------------------------

    /**
     * Whether a file's first bytes are an MP4 container: an ISO BMFF `ftyp` box whose major brand is not
     * QuickTime's (`qt  `, a `.mov`). Shorter than 12 bytes is not a video at all.
     */
    fun isMp4Container(head: ByteArray): Boolean {
        if (head.size < 12) return false
        val box = String(head, 4, 4, Charsets.ISO_8859_1)
        val brand = String(head, 8, 4, Charsets.ISO_8859_1)
        return box == "ftyp" && brand != "qt  "
    }

    /** What the track check found. */
    sealed class TrackCheck {
        object Accepted : TrackCheck()
        data class Refused(val reason: String) : TrackCheck()
    }

    const val VIDEO_AVC = "video/avc"
    const val AUDIO_AAC = "audio/mp4a-latm"

    /**
     * The shell sends a video as it is, so only what every receiver plays is accepted: exactly one
     * H.264 video track, and either one AAC audio track or none. HEVC (most phones' "high efficiency"
     * setting), AMR audio (the emulator camera) or a second audio track is refused — the shell does
     * not convert. Tracks that are neither audio nor video (timed metadata some cameras add) play no
     * part in playback and are not judged.
     */
    fun checkTracks(trackMimeTypes: List<String?>): TrackCheck {
        val types = trackMimeTypes.map { it?.lowercase().orEmpty() }
        val videos = types.filter { it.startsWith("video/") }
        val audios = types.filter { it.startsWith("audio/") }
        if (videos.size != 1) return TrackCheck.Refused("expected one video track, found ${videos.size}")
        if (videos.single() != VIDEO_AVC) return TrackCheck.Refused("the video is ${videos.single()}, not H.264")
        if (audios.size > 1) return TrackCheck.Refused("expected at most one audio track, found ${audios.size}")
        if (audios.isNotEmpty() && audios.single() != AUDIO_AAC) return TrackCheck.Refused("the audio is ${audios.single()}, not AAC")
        return TrackCheck.Accepted
    }

    /** The size a video is shown at: its coded size, turned by its rotation metadata. */
    fun displaySize(width: Int, height: Int, rotationDegrees: Int): Pair<Int, Int> {
        val quarterTurns = Math.floorMod(rotationDegrees, 360) / 90
        return if (quarterTurns % 2 == 1) height to width else width to height
    }

    // ---- Poster ---------------------------------------------------------------------------------

    /** The poster's long edge, in pixels — the server's thumbnail size. */
    const val POSTER_MAX_EDGE = 400

    /** The largest poster the shell writes; it also crosses the bridge as base64. */
    const val POSTER_MAX_BYTES = 200 * 1024

    /** Where the frame is taken, in microseconds: half a second in, past a fade from black. */
    const val POSTER_TIME_US = 500_000L

    /** JPEG qualities tried in turn until a poster fits [POSTER_MAX_BYTES]. */
    val POSTER_QUALITIES = listOf(70, 60, 50, 40, 30, 20)

    /** The frame time: [POSTER_TIME_US], or the first frame for a shorter video or an unknown length. */
    fun posterTimeUs(durationUs: Long?): Long =
        if (durationUs != null && durationUs >= POSTER_TIME_US) POSTER_TIME_US else 0L

    /** A frame's size scaled so its long edge is at most [maxEdge], never enlarged, never below 1 px. */
    fun posterSize(width: Int, height: Int, maxEdge: Int = POSTER_MAX_EDGE): Pair<Int, Int> {
        if (width <= 0 || height <= 0) return width to height
        val longEdge = maxOf(width, height)
        if (longEdge <= maxEdge) return width to height
        val scale = maxEdge.toDouble() / longEdge
        return maxOf(1, Math.round(width * scale).toInt()) to maxOf(1, Math.round(height * scale).toInt())
    }

    // ---- Internals ------------------------------------------------------------------------------

    private fun cutUtf8(text: String, maxBytes: Int): String {
        var bytes = 0
        var index = 0
        while (index < text.length) {
            val codePoint = text.codePointAt(index)
            val size = String(Character.toChars(codePoint)).toByteArray(Charsets.UTF_8).size
            if (bytes + size > maxBytes) break
            bytes += size
            index += Character.charCount(codePoint)
        }
        return text.substring(0, index)
    }
}
