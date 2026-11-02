package io.chatic.dou.media.core

import io.chatic.dou.transfer.core.DownloadFiles

/**
 * Which downloaded files media export hands on, and as what: the byte families it takes, the type a
 * file goes out under, and the name `SaveFile` keeps it under. Plain Kotlin, unit-tested; the media
 * store, the share sheet and the viewer live in [io.chatic.dou.module.MediaExportModule].
 *
 * The bytes gate, the name types. A DOCX, an XLSX, an HWPX and a plain ZIP archive are all ZIP files,
 * and only the name tells them apart — so a file is let through by what its first bytes are, and then
 * typed by its name's extension. The download already named an image after its bytes, so the two agree there.
 */
object ExportFormats {

    /** How many leading bytes [family] reads: enough for the text check, which looks for a NUL. */
    const val SNIFF_BYTES = 4096

    /** The kinds of file the shell lets out, by their first bytes. */
    enum class Family(val fallbackMimeType: String) {
        PNG("image/png"),
        JPEG("image/jpeg"),
        GIF("image/gif"),
        WEBP("image/webp"),

        /** ISO BMFF — `ftyp` at byte 4 — that is not [M4A]: an MP4. */
        MP4("video/mp4"),

        /**
         * ISO BMFF with the `M4A ` brand, or named `.m4a`: AAC audio. The name counts because a
         * recorder may write a generic brand (`isom`, `mp42`) into an audio-only file.
         */
        M4A("audio/mp4"),

        /** An ID3 tag, or an MPEG audio frame sync (`FF Ex`, `FF Fx`): an MP3. */
        MP3("audio/mpeg"),

        /** `RIFF` with the `WAVE` form type. */
        WAV("audio/wav"),

        /** An Ogg page, `OggS`. */
        OGG("audio/ogg"),
        PDF("application/pdf"),

        /** `PK\x03\x04`: DOCX, XLSX, PPTX and HWPX, and a plain ZIP archive. */
        ZIP("application/zip"),

        /** The OLE2 compound file header: HWP. */
        OLE2("application/octet-stream"),

        /** A `.txt` name with no NUL in its first [SNIFF_BYTES]. */
        TEXT("text/plain"),
    }

    private val OLE2_MAGIC = intArrayOf(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)

    /** The family [head] (a file's first bytes) belongs to, or null when the shell does not let it out. */
    fun family(head: ByteArray, name: String): Family? {
        when (DownloadFiles.sniffImage(head)) {
            DownloadFiles.ImageType.PNG -> return Family.PNG
            DownloadFiles.ImageType.JPEG -> return Family.JPEG
            DownloadFiles.ImageType.GIF -> return Family.GIF
            DownloadFiles.ImageType.WEBP -> return Family.WEBP
            null -> Unit
        }
        fun matches(offset: Int, vararg expected: Int) =
            head.size >= offset + expected.size && expected.withIndex().all { (i, byte) -> head[offset + i].toInt() and 0xFF == byte }
        fun ascii(offset: Int, text: String) = matches(offset, *text.map { it.code }.toIntArray())
        return when {
            // Before the MP4 rule, which every M4A would also pass.
            isMp4(head) && (ascii(8, "M4A ") || extensionOf(name) == "m4a") -> Family.M4A
            isMp4(head) -> Family.MP4
            ascii(0, "%PDF") -> Family.PDF
            matches(0, 0x50, 0x4B, 0x03, 0x04) -> Family.ZIP
            matches(0, *OLE2_MAGIC) -> Family.OLE2
            ascii(0, "ID3") -> Family.MP3
            ascii(0, "RIFF") && ascii(8, "WAVE") -> Family.WAV
            ascii(0, "OggS") -> Family.OGG
            extensionOf(name) == "txt" && head.none { it.toInt() == 0 } -> Family.TEXT
            // The loosest rule, so after text: a UTF-16 text file opens `FF FE`. iOS orders it the same.
            isMpegFrameSync(head) -> Family.MP3
            else -> null
        }
    }

    /** ISO BMFF: bytes 4 to 7 are `ftyp`. */
    fun isMp4(head: ByteArray): Boolean =
        head.size >= 8 && head[4].toInt() == 'f'.code && head[5].toInt() == 't'.code && head[6].toInt() == 'y'.code && head[7].toInt() == 'p'.code

    /** Eleven sync bits: `FF` and the top three bits of the next byte, `FF Ex` or `FF Fx`. */
    private fun isMpegFrameSync(head: ByteArray): Boolean =
        head.size >= 2 && head[0].toInt() and 0xFF == 0xFF && head[1].toInt() and 0xE0 == 0xE0

    /**
     * What the photo library takes: the four images and MP4 — the type it is saved as, or null. [name]
     * keeps an M4A out: its bytes alone can pass for an MP4, and the gallery would list audio as a video.
     */
    fun photoLibraryType(head: ByteArray, name: String): String? =
        DownloadFiles.sniffImage(head)?.mimeType ?: if (family(head, name) == Family.MP4) Family.MP4.fallbackMimeType else null

    /** The type of each name extension the shell saves, as the web declares it on upload. */
    private val MIME_BY_EXTENSION = mapOf(
        "png" to "image/png",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "mp4" to "video/mp4",
        "mp3" to "audio/mpeg",
        "m4a" to "audio/mp4",
        "wav" to "audio/wav",
        "ogg" to "audio/ogg",
        "pdf" to "application/pdf",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "hwp" to "application/x-hwp",
        "hwpx" to "application/hwp+zip",
        "txt" to "text/plain",
        "zip" to "application/zip",
    )

    /** The extensions `SaveFile` keeps a file under: the formats the shell saves, nothing else. */
    val SAVE_EXTENSIONS: Set<String> = MIME_BY_EXTENSION.keys

    /** The type a file goes out under: by its name's extension, else by its [family]. */
    fun mimeType(name: String, family: Family): String = MIME_BY_EXTENSION[extensionOf(name)] ?: family.fallbackMimeType

    /** The type a name's extension stands for, or null for one the shell does not save. */
    fun mimeTypeForName(name: String): String? = MIME_BY_EXTENSION[extensionOf(name)]

    /** The lower-case text after the last dot, unless that dot is the first or last character. */
    fun extensionOf(name: String): String? {
        val dot = name.lastIndexOf('.')
        return if (dot > 0 && dot < name.length - 1) name.substring(dot + 1).lowercase() else null
    }

    /** Characters FAT-style storage refuses in a name. */
    private val UNSAFE_CHARACTERS = setOf(':', '*', '?', '"', '<', '>', '|')

    /** The largest name, in UTF-8 bytes, a saved file gets; file systems stop at 255. */
    const val MAX_SAVE_NAME_BYTES = 200

    /**
     * The name `SaveFile` keeps a file under, or null when it may not be saved. The name comes from
     * the web, so it is checked once more here: path separators and control characters are removed,
     * characters some storage refuses replaced with `_`, spaces and dots trimmed at either end, the
     * extension lowered, and the base cut to fit. A name whose extension is not one of
     * [SAVE_EXTENSIONS] — no extension, `.exe`, `.apk`, `.html` — is refused rather than renamed: the
     * person would not recognise the file it became.
     */
    fun saveName(name: String?): String? {
        val cleaned = buildString {
            name.orEmpty().codePoints().forEach { codePoint ->
                when {
                    codePoint < 0x20 || codePoint in 0x7F..0x9F -> Unit
                    codePoint == '/'.code || codePoint == '\\'.code -> Unit
                    codePoint < 0x10000 && codePoint.toChar() in UNSAFE_CHARACTERS -> append('_')
                    else -> appendCodePoint(codePoint)
                }
            }
        }.trim { it == ' ' || it == '.' }
        val extension = extensionOf(cleaned)?.takeIf { it in SAVE_EXTENSIONS } ?: return null
        val base = cleaned.substring(0, cleaned.lastIndexOf('.')).trim { it == ' ' || it == '.' }
        if (base.isEmpty()) return null
        val budget = MAX_SAVE_NAME_BYTES - extension.length - 1
        return "${cutUtf8(base, budget).trimEnd(' ', '.')}.$extension"
    }

    /** Where a saved file is, as the person sees it in the Files app. */
    fun saveLocation(folder: String, name: String): String = "$folder/$name"

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
