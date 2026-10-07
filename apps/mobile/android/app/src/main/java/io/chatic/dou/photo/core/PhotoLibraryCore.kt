package io.chatic.dou.photo.core

import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.ExecutorService

/**
 * The rules of the photo-library bridge that need no Android framework: which media a list covers,
 * access, paging, item ids, preview sizes and how many are made at once, the form a picked photo leaves
 * the device in, and file names.
 * Kept apart so plain JVM tests cover them; the MediaStore, Bitmap and EXIF calls live in
 * [io.chatic.dou.module.PhotoLibraryModule].
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

    // --- Media types ---

    /**
     * What a list covers. Never neither: a request that names nothing this shell knows lists photos,
     * which is what every list did before videos could be asked for — a web build that does not send
     * `mediaTypes` keeps getting exactly that.
     */
    data class MediaTypes(val images: Boolean, val videos: Boolean)

    val IMAGES_ONLY = MediaTypes(images = true, videos = false)

    /** `request.mediaTypes` as the web sends it: `"image"` and `"video"` count, anything else is ignored. */
    fun mediaTypes(requested: List<String?>?): MediaTypes {
        val images = requested.orEmpty().any { it == "image" }
        val videos = requested.orEmpty().any { it == "video" }
        return if (images || videos) MediaTypes(images, videos) else IMAGES_ONLY
    }

    /**
     * What a list actually serves: the requested types while videos are readable, photos alone when
     * they are not. A list never answers empty for want of a video grant — the photos it can read are
     * still worth showing, and the access it reports is the photos' access.
     */
    fun listable(requested: MediaTypes, videoReadable: Boolean): MediaTypes =
        if (!requested.videos || videoReadable) requested else IMAGES_ONLY

    /** MediaStore's `media_type` values (`MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE` / `_VIDEO`). */
    const val MEDIA_TYPE_IMAGE = 1
    const val MEDIA_TYPE_VIDEO = 3

    /**
     * Whether a list reads the files table rather than the images table. Only a list that serves
     * videos does: one query over both keeps a single newest-first order and a single cursor, which
     * two tables merged by hand could not keep across pages. A photos-only list stays on the images
     * table, exactly as before videos existed.
     */
    fun readsFiles(types: MediaTypes): Boolean = types.videos

    /** The files-table clause that narrows it to [types]; null for the images table, which needs none. */
    fun mediaTypeClause(types: MediaTypes): String? = when {
        !readsFiles(types) -> null
        types.images -> "media_type IN ($MEDIA_TYPE_IMAGE, $MEDIA_TYPE_VIDEO)"
        else -> "media_type = $MEDIA_TYPE_VIDEO"
    }

    // --- Item ids ---

    /**
     * A video's id carries a prefix. The web hands ids back without knowing what they name, and an
     * old `ReadPhoto` given a bare video `_id` would read it as a photo; with the prefix it is not a
     * number, so `ReadPhoto` refuses it as `INVALID`. Photo ids stay the bare `_id` they always were.
     */
    const val VIDEO_ID_PREFIX = "v:"

    fun itemId(id: Long, isVideo: Boolean): String = if (isVideo) "$VIDEO_ID_PREFIX$id" else id.toString()

    /** The `_id` a `v:` id names, or null — `INVALID` — for anything else, a bare photo id included. */
    fun videoId(raw: String?): Long? {
        if (raw == null || !raw.startsWith(VIDEO_ID_PREFIX)) return null
        return raw.substring(VIDEO_ID_PREFIX.length).toLongOrNull()?.takeIf { it >= 0 }
    }

    /** A video's length as the web is told it: MediaStore leaves it 0 or empty when it does not know. */
    fun durationMs(raw: Long?): Long? = raw?.takeIf { it > 0 }

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

    /** The read permissions as the system reports them; [userSelected] counts only on API 34+. */
    data class Grants(val images: Boolean, val videos: Boolean, val userSelected: Boolean, val storage: Boolean)

    /** The photos' access, which is the access every list reports. */
    fun photoAccess(sdkInt: Int, grants: Grants): String =
        access(
            fullGranted = if (sdkInt >= 33) grants.images else grants.storage,
            partialGranted = sdkInt >= 34 && grants.userSelected,
        )

    /**
     * Android 14's partial access: nothing but READ_MEDIA_VISUAL_USER_SELECTED. "Allow all" grants
     * that one as well, so it alone says nothing — only with images and video both denied is the
     * access partial.
     */
    fun partialAccess(sdkInt: Int, grants: Grants): Boolean =
        sdkInt >= 34 && grants.userSelected && !grants.images && !grants.videos

    /**
     * Whether a list may serve videos. Below 13 the storage permission reads both. From 13 videos have
     * their own permission, judged apart from the photos' — a build that asked only for photos left
     * users with photos and no videos. Partial access covers the videos the user selected along with
     * the photos.
     */
    fun videoReadable(sdkInt: Int, grants: Grants): Boolean = when {
        sdkInt < 33 -> grants.storage
        else -> grants.videos || partialAccess(sdkInt, grants)
    }

    /**
     * Whether a list should raise the system prompt. Only the first time: iOS asks once and then
     * reports what the user chose, and asking again on every attach-menu open would be the same
     * dialog over and over until Android stops showing it. Denied after that is the web's settings
     * prompt to offer.
     */
    fun shouldAsk(access: String, askedBefore: Boolean): Boolean = access == "denied" && !askedBefore

    /**
     * Whether a list should ask for video on its own: a user who granted photos — all of them, or a
     * selection — to a build that never asked for video is asked once, by the first list that wants
     * videos. Judged by the video grant itself, not by what a list may read: under partial access the
     * selection covers videos too, but a selection made in a build that asked for photos holds none,
     * and asking is what lets the user add some (API 35 shows "allow access to more photos and videos",
     * and its "limited access" opens a videos picker). With every photo allowed the system grants
     * video without a dialog. The first-ever ask already includes video, so this is only that upgrade;
     * an answer of no leaves the grid as it was and is not asked again. Below 13 the storage permission
     * already covers videos.
     */
    fun shouldAskForVideo(
        sdkInt: Int,
        videoRequested: Boolean,
        photoAccess: String,
        videoGranted: Boolean,
        askedForVideoBefore: Boolean,
    ): Boolean = sdkInt >= 33 && videoRequested && photoAccess != "denied" && !videoGranted && !askedForVideoBefore

    /**
     * The runtime permissions a read needs on this SDK level. From 13 photos and videos are asked
     * together — the system shows one "photos and videos" dialog for them.
     */
    fun permissionsFor(sdkInt: Int): List<String> = when {
        sdkInt >= 34 -> listOf(READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_VISUAL_USER_SELECTED)
        sdkInt >= 33 -> listOf(READ_MEDIA_IMAGES, READ_MEDIA_VIDEO)
        else -> listOf(READ_EXTERNAL_STORAGE)
    }

    /** Whether a request made on this SDK level asks for video, so its answer settles the video ask too. */
    fun asksForVideo(sdkInt: Int): Boolean = READ_MEDIA_VIDEO in permissionsFor(sdkInt)

    const val READ_MEDIA_IMAGES = "android.permission.READ_MEDIA_IMAGES"
    const val READ_MEDIA_VIDEO = "android.permission.READ_MEDIA_VIDEO"
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

    /**
     * The MediaStore selection for one page: the media types when the files table is read
     * ([mediaTypeClause]), an album (bucket) when one is chosen, and older than [after].
     */
    fun pageSelection(bucketId: String?, after: PageKey?, mediaTypeClause: String? = null): Pair<String?, Array<String>> {
        val clauses = mutableListOf<String>()
        val args = mutableListOf<String>()
        if (mediaTypeClause != null) clauses += mediaTypeClause
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

    /**
     * `request.offset`: where a page cut by index starts. Null — page by cursor, as before — when it is
     * absent, not a finite number, or negative; a fractional one is floored.
     */
    fun offset(raw: Double?): Int? {
        if (raw == null || !raw.isFinite() || raw < 0) return null
        return kotlin.math.floor(raw).toInt()
    }

    /** The indices of a page cut by offset: [start] inclusive, [end] exclusive. */
    data class OffsetPage(val start: Int, val end: Int)

    /**
     * The page [offset] asks for in a list of [total] items: from [offset] clamped to [total], at most
     * [pageSize] of [limit] long. An offset past the end is an empty page at [total].
     */
    fun offsetPage(offset: Int, limit: Int, total: Int): OffsetPage {
        val count = maxOf(total, 0)
        val start = offset.coerceIn(0, count)
        val end = minOf(start.toLong() + pageSize(limit), count.toLong()).toInt()
        return OffsetPage(start, end)
    }

    // --- Sized previews ---

    /** The range a requested `thumbSize` is clamped to, in pixels. */
    const val MIN_THUMB_SIZE = 64
    const val MAX_THUMB_SIZE = 720

    /** JPEG quality of a square preview: they are drawn at full tile size, where 70 shows its blocks. */
    const val SIZED_JPEG_QUALITY = 80

    /**
     * Most a preview's decode box is stretched for a long photo. A 10:1 panorama would otherwise decode
     * at ten times the tile; past 3:1 its square comes out a little under the size asked for instead.
     */
    const val MAX_FIT_RATIO = 3

    /**
     * `request.thumbSize`: the side of a square preview, clamped to [MIN_THUMB_SIZE]..[MAX_THUMB_SIZE].
     * Null — the uncropped [THUMBNAIL_EDGE] previews of before — when it is absent, not a finite
     * number, or not positive.
     */
    fun thumbSize(raw: Double?): Int? {
        if (raw == null || !raw.isFinite() || raw <= 0) return null
        return kotlin.math.round(raw.coerceIn(MIN_THUMB_SIZE.toDouble(), MAX_THUMB_SIZE.toDouble())).toInt()
    }

    /**
     * The side of the square box a fit-within decode is asked for so that the image's short side comes
     * out at [size]: `size * long / short`, rounded up, the ratio capped at [MAX_FIT_RATIO]. Which side
     * is long does not matter — a square box serves either — so width and height reported unrotated
     * still give the right box. An unknown dimension gives [size].
     */
    fun fitBox(width: Int, height: Int, size: Int): Int {
        if (width <= 0 || height <= 0) return size
        val long = maxOf(width, height).toLong()
        val short = minOf(width, height).toLong()
        if (long >= short * MAX_FIT_RATIO) return size * MAX_FIT_RATIO
        return ((size * long + short - 1) / short).toInt()
    }

    /** A square crop: its top-left corner and side, in the pixels of the image it is cut from. */
    data class Square(val x: Int, val y: Int, val side: Int)

    /** The centred square of a [width] × [height] image — the one actually decoded, not the library's. */
    fun centerSquare(width: Int, height: Int): Square {
        val side = maxOf(minOf(width, height), 0)
        return Square((width - side) / 2, (height - side) / 2, side)
    }

    /** The side a square preview is drawn at: [size], never past what the decoded image holds. */
    fun squareSide(size: Int, width: Int, height: Int): Int =
        if (width <= 0 || height <= 0) size else minOf(size, minOf(width, height))

    // --- Parallel previews ---

    /**
     * The most previews made at once. Each one holds a decode — up to a 2160 × 720 bitmap for a
     * panorama at the largest size — so the cap bounds memory as well as threads.
     */
    const val MAX_PREVIEW_WORKERS = 4

    /**
     * How many previews of one list are made at once on a device with [cpuCount] cores: one core is
     * left for the UI and the WebView, at least one worker always runs, and never more than
     * [MAX_PREVIEW_WORKERS].
     */
    fun previewWorkers(cpuCount: Int): Int = minOf(MAX_PREVIEW_WORKERS, maxOf(1, cpuCount - 1))

    /**
     * [transform] of each of [items] on [executor], answered in the order of [items] whatever order
     * the tasks finish in. An empty list never touches the executor. A throw from [transform] is
     * rethrown as itself, not wrapped in the executor's [ExecutionException]; the tasks still queued
     * behind it run to the end regardless, since nothing here cancels them.
     */
    fun <T, R> mapInParallel(items: List<T>, executor: ExecutorService, transform: (T) -> R): List<R> {
        if (items.isEmpty()) return emptyList()
        val futures = items.map { item -> executor.submit(Callable { transform(item) }) }
        return futures.map { future ->
            try {
                future.get()
            } catch (e: ExecutionException) {
                throw e.cause ?: e
            }
        }
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
