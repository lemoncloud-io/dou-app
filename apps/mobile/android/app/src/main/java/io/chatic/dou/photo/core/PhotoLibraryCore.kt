package io.chatic.dou.photo.core

/**
 * The rules of the photo-library bridge that need no Android framework: access, paging, the form a
 * picked photo leaves the device in, and file names. Kept apart so plain JVM tests cover them; the
 * MediaStore, Bitmap and EXIF calls live in [io.chatic.dou.module.PhotoLibraryModule].
 */
object PhotoLibraryCore {
    /** The largest page the shell hands back; the web asks for 60, and a page is base64 in page memory. */
    const val MAX_PAGE_SIZE = 200

    /** Long edge of a grid preview, in pixels. */
    const val THUMBNAIL_EDGE = 256

    /**
     * Long edge a camera RAW photo is rendered at. A full-size DNG decode is far more memory than a
     * phone should spend on one send, and its JPEG passes the server's 20 MB ceiling anyway.
     */
    const val RAW_MAX_EDGE = 4096

    /** JPEG quality for anything the shell has to re-encode. */
    const val JPEG_QUALITY = 90

    /** The id of the first album, the whole library; the web hands it back as `ListPhotos.albumId`. */
    const val ALL_PHOTOS_ALBUM_ID = "all"

    // --- Access ---

    /**
     * The contract's `PhotoLibraryAccess`. Android 14's "allow limited access" grants only
     * READ_MEDIA_VISUAL_USER_SELECTED, which is what iOS calls limited.
     */
    fun access(fullGranted: Boolean, partialGranted: Boolean): String = when {
        fullGranted -> "granted"
        partialGranted -> "limited"
        else -> "denied"
    }

    /**
     * Whether a list should raise the system prompt. Only the first time: iOS asks once and then
     * reports what the user chose, and asking again on every attach-menu open would be the same
     * dialog over and over until Android stops showing it. Denied after that is the web's settings
     * prompt to offer.
     */
    fun shouldAsk(access: String, askedBefore: Boolean): Boolean = access == "denied" && !askedBefore

    /** The runtime permissions a read needs on this SDK level. */
    fun permissionsFor(sdkInt: Int): List<String> = when {
        sdkInt >= 34 -> listOf(READ_MEDIA_IMAGES, READ_MEDIA_VISUAL_USER_SELECTED)
        sdkInt >= 33 -> listOf(READ_MEDIA_IMAGES)
        else -> listOf(READ_EXTERNAL_STORAGE)
    }

    const val READ_MEDIA_IMAGES = "android.permission.READ_MEDIA_IMAGES"
    const val READ_MEDIA_VISUAL_USER_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
    const val READ_EXTERNAL_STORAGE = "android.permission.READ_EXTERNAL_STORAGE"

    // --- Albums ---

    /** Whether a `ListPhotos.albumId` means the whole library. Omitting it does too. */
    fun isAllPhotos(albumId: String?): Boolean = albumId == null || albumId == ALL_PHOTOS_ALBUM_ID

    // --- Paging ---

    /**
     * Where the next page starts: the sort key of the last photo sent. Pages are cut by key, not by
     * offset, so a photo added or deleted while the grid is open neither repeats nor skips one — the
     * next page is simply "older than this", whether or not that photo still exists.
     */
    data class PageKey(val dateAdded: Long, val id: Long)

    fun encode(key: PageKey): String = "${key.dateAdded}:${key.id}"

    /** Null for anything this shell did not write, which starts the list from the top. */
    fun decode(raw: String?): PageKey? {
        val parts = raw?.split(":") ?: return null
        if (parts.size != 2) return null
        val dateAdded = parts[0].toLongOrNull() ?: return null
        val id = parts[1].toLongOrNull() ?: return null
        if (dateAdded < 0 || id < 0) return null
        return PageKey(dateAdded, id)
    }

    /** A page size the shell will serve: never below one, never above [MAX_PAGE_SIZE]. */
    fun pageSize(limit: Int): Int = limit.coerceIn(1, MAX_PAGE_SIZE)

    /** Newest first, with the id as the tie-break so the order is total and a key is unambiguous. */
    const val SORT_ORDER = "date_added DESC, _id DESC"

    /** The MediaStore selection for one page: an album (bucket) when one is chosen, and older than [after]. */
    fun pageSelection(bucketId: String?, after: PageKey?): Pair<String?, Array<String>> {
        val clauses = mutableListOf<String>()
        val args = mutableListOf<String>()
        if (bucketId != null) {
            clauses += "bucket_id = ?"
            args += bucketId
        }
        if (after != null) {
            clauses += "(date_added < ? OR (date_added = ? AND _id < ?))"
            args += listOf(after.dateAdded.toString(), after.dateAdded.toString(), after.id.toString())
        }
        return (if (clauses.isEmpty()) null else clauses.joinToString(" AND ")) to args.toTypedArray()
    }

    // --- Export ---

    /** What a picked photo's bytes need before the web can send them. */
    sealed class Export {
        /** Sent as stored. */
        data class Original(val mimeType: String, val extension: String) : Export()

        /** Sent as stored, with the location taken out of its metadata — the pixels are not re-encoded. */
        data class StripLocation(val mimeType: String, val extension: String) : Export()

        /**
         * Re-encoded as JPEG: the server takes png, jpeg, gif and webp and answers anything else
         * (HEIC, HEIF, AVIF) with a 415. [maxEdge] is set only for camera RAW.
         */
        data class Jpeg(val maxEdge: Int?) : Export()
    }

    /**
     * Decided by the MIME type MediaStore reports. GIF goes up untouched so it stays animated, and
     * WebP because rewriting it is not worth the risk for a format that rarely carries a location.
     * JPEG and PNG keep their pixels but lose GPS: a photo picked from the grid is shared with
     * everyone in the room, and where it was taken is not something picking it chose to share.
     */
    fun export(mimeType: String?): Export = when (mimeType?.lowercase()) {
        "image/jpeg", "image/jpg" -> Export.StripLocation("image/jpeg", "jpg")
        "image/png" -> Export.StripLocation("image/png", "png")
        "image/gif" -> Export.Original("image/gif", "gif")
        "image/webp" -> Export.Original("image/webp", "webp")
        else -> Export.Jpeg(if (isRaw(mimeType)) RAW_MAX_EDGE else null)
    }

    /** DNG and the vendor RAW types (`image/x-sony-arw`, `image/x-canon-cr2`, …). */
    fun isRaw(mimeType: String?): Boolean {
        val type = mimeType?.lowercase() ?: return false
        if (type == "image/dng" || type == "image/x-adobe-dng") return true
        return type.startsWith("image/x-") && RAW_SUFFIXES.any { type.endsWith(it) }
    }

    private val RAW_SUFFIXES = listOf("-arw", "-cr2", "-cr3", "-nef", "-nrw", "-orf", "-raf", "-rw2", "-pef", "-srw", "-raw")

    /**
     * The name the photo is sent under: the library's name with the extension its bytes now have, so
     * `IMG_0001.HEIC` converted to JPEG goes up as `IMG_0001.jpg`.
     */
    fun fileName(original: String?, extension: String): String {
        val trimmed = original?.trim().orEmpty()
        val base = trimmed.substringBeforeLast('.', trimmed).ifEmpty { "photo" }
        return "$base.$extension"
    }

    /**
     * The largest power-of-two subsample that still leaves the long edge at or above [maxEdge] — the
     * decoder's cheap first step, before the exact scale.
     */
    fun sampleSize(width: Int, height: Int, maxEdge: Int): Int {
        val longEdge = maxOf(width, height)
        if (longEdge <= 0 || maxEdge <= 0) return 1
        var sample = 1
        while (longEdge / (sample * 2) >= maxEdge) sample *= 2
        return sample
    }

    /**
     * The web's per-image ceiling (`CHAT_ATTACHMENT_MAX_BYTES.image`). A photo sent as stored that is
     * larger will be refused there anyway, so it is refused here before its bytes — held several
     * times over as the original, the stripped copy and base64 — can run the app out of memory.
     */
    const val SEND_MAX_BYTES = 20L * 1024 * 1024

    /** Whether [export] sends the stored bytes, so the stored size is the size that goes up. */
    fun sendsStoredBytes(export: Export): Boolean = export !is Export.Jpeg

    fun tooLargeToSend(sizeBytes: Long, export: Export): Boolean =
        sendsStoredBytes(export) && sizeBytes > SEND_MAX_BYTES

    /**
     * The most pixels one decode may hold: 24 MP is about 96 MB as ARGB, which a phone's app heap
     * can take once. A larger photo converted to JPEG is decoded smaller — it could not have been
     * sent at full size under [SEND_MAX_BYTES] in any case.
     */
    const val MAX_DECODE_PIXELS = 24_000_000L

    /**
     * The size to decode a [width] × [height] image at, so that its long edge is at most [maxEdge]
     * (when given) and it holds at most [maxPixels]; null when it fits as it is.
     */
    fun decodeTarget(width: Int, height: Int, maxEdge: Int?, maxPixels: Long = MAX_DECODE_PIXELS): Pair<Int, Int>? {
        if (width <= 0 || height <= 0) return null
        var scale = 1.0
        if (maxEdge != null && maxOf(width, height) > maxEdge) scale = maxEdge.toDouble() / maxOf(width, height)
        val pixels = width.toLong() * height
        if (pixels * scale * scale > maxPixels) scale = kotlin.math.sqrt(maxPixels.toDouble() / pixels)
        if (scale >= 1.0) return null
        return maxOf(1, (width * scale).toInt()) to maxOf(1, (height * scale).toInt())
    }

    /** Whether an XMP packet still says where the photo was taken. */
    fun xmpHasLocation(xmp: String?): Boolean = xmp?.contains("GPS", ignoreCase = false) ?: false
}
