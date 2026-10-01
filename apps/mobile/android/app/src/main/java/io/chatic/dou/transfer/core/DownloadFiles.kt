package io.chatic.dou.transfer.core

import java.io.File
import java.net.URI
import java.net.URISyntaxException
import java.nio.file.InvalidPathException
import java.nio.file.Paths
import java.security.MessageDigest

/**
 * Rules for the folder downloads land in, shared by the transfer (which writes it) and media export
 * (which reads it): where a download's file goes, what it is called, whether its bytes are an image,
 * which files may leave the app, and when an old file is swept.
 *
 * The iOS shell implements the same rules in `DownloadFiles.swift`; the numbered core tests pin the
 * two to the same answers. Only `java.*` is used, so the rules run as JVM unit tests.
 *
 * Layout, under the app's cache directory:
 * ```
 * transfer-download/
 *   └ <folderName(transferId)>/
 *       ├ photo.png.part   being received — never exported
 *       └ photo.png        committed — what save and share accept
 * ```
 */
object DownloadFiles {

    /** The download folder's name under the cache directory. The share provider's path rule names it too. */
    const val FOLDER = "transfer-download"

    const val PART_SUFFIX = ".part"
    const val DEFAULT_BASE_NAME = "image"
    const val MAX_BASE_NAME_LENGTH = 60

    /** How many leading bytes [sniffImage] needs; a shorter file is never an image here. */
    const val SNIFF_BYTES = 12

    /** A transfer folder whose last change is older than this is swept at the next download start. */
    const val SWEEP_AGE_MS = 24L * 60 * 60 * 1000

    private const val MAX_EXTENSION_LENGTH = 10

    /** Characters FAT-style storage refuses in a name; replaced so the public Pictures copy can be written. */
    private val UNSAFE_CHARACTERS = setOf(':', '*', '?', '"', '<', '>', '|')

    // ---- Commit (U17) ---------------------------------------------------------------------------

    /**
     * Whether a download's body becomes a file. Only a 2xx does: any other status carries an error
     * document — S3 answers an expired signature with a 403 XML body — which must never be saved
     * under an image's name.
     */
    fun keepsBody(httpStatus: Int): Boolean = httpStatus in 200..299

    /** The progress denominator from a response's declared length; missing (-1) or chunked is 0, unknown. */
    fun totalBytes(contentLength: Long): Long = if (contentLength > 0) contentLength else 0

    // ---- Where a download goes ------------------------------------------------------------------

    /**
     * The folder a transfer writes into. The id is chosen by the web, which is loaded remotely, so it
     * is hashed rather than used as a path segment: an id such as `../../databases` must not be able
     * to name a folder of its own.
     */
    fun folderName(transferId: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(transferId.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    // ---- Names (U21) ----------------------------------------------------------------------------

    /** A sanitised name hint: the base, and the extension the hint carried, if any (lower case). */
    data class NameParts(val base: String, val extension: String?)

    /**
     * Cleans a name hint from the web: keeps only the last path segment, drops control characters,
     * replaces characters some storage refuses, trims spaces and dots at either end, splits off a
     * short alphanumeric extension, and cuts the base to [MAX_BASE_NAME_LENGTH] code points. An empty
     * result becomes [DEFAULT_BASE_NAME]. Applying it to its own [fileName] output changes nothing.
     */
    fun nameParts(hint: String?): NameParts {
        val segment = hint.orEmpty().substringAfterLast('/').substringAfterLast('\\')
        val cleaned = buildString {
            segment.codePoints().forEach { codePoint ->
                when {
                    isControl(codePoint) -> Unit
                    codePoint < 0x10000 && codePoint.toChar() in UNSAFE_CHARACTERS -> append('_')
                    else -> appendCodePoint(codePoint)
                }
            }
        }.trimEdges().withoutPartSuffix()

        val dot = cleaned.lastIndexOf('.')
        val suffix = if (dot > 0) cleaned.substring(dot + 1) else ""
        val hasExtension = suffix.length in 1..MAX_EXTENSION_LENGTH && suffix.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' }
        val extension = if (hasExtension) suffix.lowercase() else null
        val rawBase = if (hasExtension) cleaned.substring(0, dot) else cleaned

        val base = takeCodePoints(rawBase.trimEdges(), MAX_BASE_NAME_LENGTH).trimEdges()
        return NameParts(base.ifEmpty { DEFAULT_BASE_NAME }, extension)
    }

    /** The committed name: the extension the bytes show when they are a known image, else the hint's. */
    fun fileName(parts: NameParts, sniffed: ImageType? = null): String {
        val extension = sniffed?.extension ?: parts.extension
        return if (extension == null) parts.base else "${parts.base}.$extension"
    }

    /** The in-progress name. It keeps the hint so a restarted process can still name the file. */
    fun partName(parts: NameParts): String = fileName(parts) + PART_SUFFIX

    /** [name], or `stem (1).ext`, `stem (2).ext`, … — the first one [taken] says is free. */
    fun uniqueName(name: String, taken: (String) -> Boolean): String {
        if (!taken(name)) return name
        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        val extension = if (dot > 0) name.substring(dot) else ""
        var index = 1
        while (true) {
            val candidate = "$stem ($index)$extension"
            if (!taken(candidate)) return candidate
            index++
        }
    }

    // ---- Image type (U20) -----------------------------------------------------------------------

    enum class ImageType(val mimeType: String, val extension: String) {
        PNG("image/png", "png"),
        JPEG("image/jpeg", "jpg"),
        GIF("image/gif", "gif"),
        WEBP("image/webp", "webp"),
    }

    /**
     * The image type a file's first bytes show, or null. The response's `Content-Type` is what the
     * uploader declared, so the bytes decide — the same way the desktop app names a saved image.
     */
    fun sniffImage(head: ByteArray): ImageType? {
        if (head.size < SNIFF_BYTES) return null
        fun matches(offset: Int, vararg expected: Int) =
            expected.withIndex().all { (i, byte) -> head[offset + i].toInt() and 0xFF == byte }
        fun ascii(offset: Int, text: String) = matches(offset, *text.map { it.code }.toIntArray())
        return when {
            matches(0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) -> ImageType.PNG
            matches(0, 0xFF, 0xD8, 0xFF) -> ImageType.JPEG
            ascii(0, "GIF87a") || ascii(0, "GIF89a") -> ImageType.GIF
            ascii(0, "RIFF") && ascii(8, "WEBP") -> ImageType.WEBP
            else -> null
        }
    }

    // ---- What may leave the app (U19) -----------------------------------------------------------

    /** The answer to "may this URI be saved or shared?". */
    sealed class ExportCheck {
        /** Inside the download folder and committed. [file] is the resolved real file. */
        data class Accepted(val file: File) : ExportCheck()

        /** Not a file the shell hands out: another scheme, outside the folder, the folder, a `.part`. */
        data class Invalid(val reason: String) : ExportCheck()

        /** Inside the folder but gone — the OS may have cleared the cache. */
        object Missing : ExportCheck()
    }

    /**
     * Decides whether [uri] names a committed download under [root]. Without this, a web page could
     * put the app's database or settings on the share sheet.
     *
     * The path is normalised first, so `..` cannot climb out, and then its real path — symbolic
     * links resolved — must still be under the real path of [root]. Both sides are resolved because
     * the cache directory itself can sit behind a link.
     */
    fun checkExportable(uri: String?, root: File): ExportCheck {
        val parsed = try {
            URI(uri.orEmpty())
        } catch (_: URISyntaxException) {
            return ExportCheck.Invalid("not a URI")
        }
        if (!parsed.scheme.equals("file", ignoreCase = true)) return ExportCheck.Invalid("only file:// URIs are accepted")
        if (!parsed.host.isNullOrEmpty()) return ExportCheck.Invalid("a file URI must not name a host")
        val path = parsed.path?.takeIf { it.startsWith("/") } ?: return ExportCheck.Invalid("the path is not absolute")
        // Checked on the raw URI too, so both shells refuse it at the same point.
        if ('\u0000' in path || uri.orEmpty().contains("%00", ignoreCase = true)) {
            return ExportCheck.Invalid("the path holds a NUL character")
        }

        val lexical = try {
            Paths.get(path).normalize().toString()
        } catch (_: InvalidPathException) {
            return ExportCheck.Invalid("the path cannot be read")
        }
        val lexicalRoot = Paths.get(root.path).normalize().toString()
        if (!isInside(lexical, lexicalRoot)) return ExportCheck.Invalid("outside the download folder")
        if (lexical.endsWith(PART_SUFFIX)) return ExportCheck.Invalid("the download has not finished")

        val file = File(lexical)
        if (!file.exists()) return ExportCheck.Missing
        val real = File(file.canonicalPath)
        val realRoot = root.canonicalPath
        if (!isInside(real.path, realRoot)) return ExportCheck.Invalid("resolves outside the download folder")
        if (real.path.endsWith(PART_SUFFIX)) return ExportCheck.Invalid("the download has not finished")
        if (!real.isFile) return ExportCheck.Invalid("not a file")
        return ExportCheck.Accepted(real)
    }

    // ---- Sweep (U22) ----------------------------------------------------------------------------

    /** One transfer folder as the sweep sees it. [modifiedAtMs] is wall-clock time, like a file's mtime. */
    data class FolderAge(val name: String, val modifiedAtMs: Long)

    /**
     * The folders to delete: last changed more than [SWEEP_AGE_MS] before [nowMs], and not the folder
     * of a transfer still running — a slow download keeps its folder whatever its age.
     */
    fun foldersToSweep(folders: List<FolderAge>, nowMs: Long, runningFolderNames: Set<String>): List<String> =
        folders.filter { it.name !in runningFolderNames && nowMs - it.modifiedAtMs > SWEEP_AGE_MS }.map { it.name }

    // ---- Internals ------------------------------------------------------------------------------

    private fun isInside(path: String, root: String): Boolean = path.startsWith(root.trimEnd('/') + "/")

    /** C0 controls, DEL and C1 controls. */
    private fun isControl(codePoint: Int): Boolean = codePoint < 0x20 || codePoint in 0x7F..0x9F

    private fun String.trimEdges(): String = trim { it == ' ' || it == '.' }

    /**
     * `.part` marks a file still being received, so a hint never keeps it — every trailing one is
     * dropped, which is what makes the rule give the same answer when applied to its own output.
     */
    private fun String.withoutPartSuffix(): String {
        var name = this
        while (name.endsWith(PART_SUFFIX, ignoreCase = true)) name = name.dropLast(PART_SUFFIX.length).trimEdges()
        return name
    }

    private fun takeCodePoints(text: String, count: Int): String {
        if (text.codePointCount(0, text.length) <= count) return text
        return text.substring(0, text.offsetByCodePoints(0, count))
    }
}
