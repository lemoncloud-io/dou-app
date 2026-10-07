package io.chatic.dou.module

import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.util.Size
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import io.chatic.dou.attach.PickedCopies
import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.attach.core.AttachPickRules.Kind
import io.chatic.dou.photo.PhotoPreparer
import io.chatic.dou.photo.core.PhotoLibraryCore
import io.chatic.dou.photo.core.PhotoLibraryCore.Export
import io.chatic.dou.photo.core.PhotoLibraryCore.MediaTypes
import io.chatic.dou.R
import java.util.TimeZone
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * PhotoLibrary — reads the device photo library (MediaStore) for the web's in-app picker: albums,
 * pages of previews, the bytes of a picked photo, and a kept copy of a picked video.
 *
 * A list covers photos, or photos and videos when the web asks for both (`mediaTypes`) and the user
 * let the app read videos. Previews and photos cross as base64 because the WebView cannot open a
 * `content://` URI; a video is too large for that, so `keepLibraryVideo` copies it into the
 * attachment picker's folder and answers its `file://` URI, as a picked video is answered. The ids
 * are handed to the web only to be handed back; a video's carries a `v:` prefix.
 *
 * Rejection codes never include `NOT_FOUND`: the web reads that code as "this app has no photo
 * library" and stops asking for the rest of the session, so a deleted photo must not look like it.
 */
class PhotoLibraryModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PhotoLibrary"
        private const val PREFS = "photo_library"
        private const val PREF_ASKED = "asked"

        // Its own key, not PREF_ASKED: users of a build that asked only for photos have PREF_ASKED
        // set and were never asked for video.
        private const val PREF_ASKED_VIDEO = "asked_video"
        private const val PERMISSION_REQUEST_CODE = 0x5048 // "PH"
        private const val PERMISSION_FALLBACK_MS = 50_000L
    }

    private class Rejection(val code: String, message: String) : Exception(message)

    // Lists run one at a time: the web drops a page it no longer wants but cannot cancel it, so
    // overlapping pages would only compete. Reads have their own thread so a send does not wait
    // behind a page of previews, and video copies theirs, so a photo does not wait behind 300 MB.
    private val listExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    // Within that one list, its previews are made a few at a time: a preview the system has not
    // cached costs tens of milliseconds of decoding, and one after another that is seconds a page.
    private val previewExecutor: ExecutorService =
        Executors.newFixedThreadPool(PhotoLibraryCore.previewWorkers(Runtime.getRuntime().availableProcessors()))
    private val readExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val keepExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    private val preparer = PhotoPreparer(reactContext)
    private val copies = PickedCopies(reactContext)

    override fun getName(): String = "PhotoLibrary"

    override fun invalidate() {
        listExecutor.shutdown()
        previewExecutor.shutdown()
        readExecutor.shutdown()
        keepExecutor.shutdown()
        super.invalidate()
    }

    /**
     * Runs [task] on [executor], or rejects [promise] when the executor is gone — after a React
     * reload a late permission answer would otherwise throw on the UI thread and take the app down.
     */
    private fun submit(executor: ExecutorService, promise: Promise, task: () -> Unit) {
        try {
            executor.execute(task)
        } catch (e: RejectedExecutionException) {
            promise.reject("INTERNAL", "The photo library is shutting down")
        }
    }

    /**
     * Settles [promise] from [body], whatever it throws. OutOfMemoryError is an Error, not an
     * Exception, so a narrower catch would let a huge photo kill the process instead of failing a send.
     */
    private fun settle(promise: Promise, what: String, body: () -> Unit) {
        try {
            body()
        } catch (rejection: Rejection) {
            promise.reject(rejection.code, rejection.message)
        } catch (e: OutOfMemoryError) {
            Log.w(TAG, "$what ran out of memory")
            promise.reject("READ_FAILED", "The photo is too large to read")
        } catch (e: Throwable) {
            Log.w(TAG, "$what failed: ${e.javaClass.simpleName}")
            promise.reject("INTERNAL", e.message ?: "Unknown error")
        }
    }

    // --- Methods ---

    @ReactMethod
    fun listAlbums(request: ReadableMap?, promise: Promise) {
        val requested = mediaTypesOf(request)
        val thumbSize = PhotoLibraryCore.thumbSize(numberOf(request, "thumbSize"))
        withAccess(promise, requested.videos) { access ->
            val reply = Arguments.createMap()
            reply.putString("access", access.photos)
            reply.putArray(
                "albums",
                if (access.photos == "denied") {
                    Arguments.createArray()
                } else {
                    albums(PhotoLibraryCore.listable(requested, access.videoReadable), thumbSize)
                },
            )
            promise.resolve(reply)
        }
    }

    @ReactMethod
    fun listPhotos(request: ReadableMap, promise: Promise) {
        // A field of the wrong type is the caller's mistake, answered as one rather than thrown on
        // the modules thread.
        val parsed = try {
            Triple(
                if (request.hasKey("albumId") && !request.isNull("albumId")) request.getString("albumId") else null,
                if (request.hasKey("after") && !request.isNull("after")) request.getString("after") else null,
                if (request.hasKey("limit") && !request.isNull("limit")) request.getDouble("limit").toInt() else 0,
            )
        } catch (e: Exception) {
            promise.reject("INVALID", "albumId and after must be strings, limit a number")
            return
        }
        val (albumId, after, limit) = parsed
        val requested = mediaTypesOf(request)
        val thumbSize = PhotoLibraryCore.thumbSize(numberOf(request, "thumbSize"))
        val offset = PhotoLibraryCore.offset(numberOf(request, "offset"))

        withAccess(promise, requested.videos) { access ->
            if (access.photos == "denied") {
                promise.resolve(Arguments.createMap().apply {
                    putString("access", access.photos)
                    putArray("items", Arguments.createArray())
                })
            } else {
                val types = PhotoLibraryCore.listable(requested, access.videoReadable)
                promise.resolve(photos(albumId, after, offset, limit, thumbSize, access.photos, types))
            }
        }
    }

    /**
     * `request.mediaTypes`, leniently: entries that are not strings are skipped and a field that is not
     * an array counts as absent, which lists photos as every list did before the field existed.
     */
    private fun mediaTypesOf(request: ReadableMap?): MediaTypes {
        val entries = try {
            if (request != null && request.hasKey("mediaTypes") && request.getType("mediaTypes") == ReadableType.Array) {
                val array = request.getArray("mediaTypes")
                (0 until (array?.size() ?: 0)).map { index ->
                    if (array?.getType(index) == ReadableType.String) array.getString(index) else null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
        return PhotoLibraryCore.mediaTypes(entries)
    }

    /**
     * A numeric field of [request], or null when it is absent, null or not a number — the core parsers
     * then treat it as not asked for, as a shell from before the field would.
     */
    private fun numberOf(request: ReadableMap?, key: String): Double? = try {
        if (request != null && request.hasKey(key) && request.getType(key) == ReadableType.Number) request.getDouble(key) else null
    } catch (e: Exception) {
        null
    }

    @ReactMethod
    fun readPhoto(id: String, promise: Promise) {
        submit(readExecutor, promise) { settle(promise, "readPhoto") { promise.resolve(read(id)) } }
    }

    /**
     * Android 14's limited access: asking for the permissions again is how the system offers "select
     * more photos". Outside limited access there is no selection to manage, so the current access
     * comes straight back.
     */
    @ReactMethod
    fun manageSelection(promise: Promise) {
        val current = currentAccess().photos
        if (current != "limited") {
            promise.resolve(current)
            return
        }
        requestPermissions { _ -> promise.resolve(currentAccess().photos) }
    }

    /**
     * Copies one library video into a new `attach-pick/<uuid>/` folder and answers it as
     * `PickAttachments` answers a picked video, so `PrepareVideo` and the upload take it from there.
     * The copy is judged as it is made: over the video ceiling is `TOO_LARGE`, not an MP4 of H.264 with
     * AAC or no audio is `UNSUPPORTED`, and either leaves no folder behind.
     */
    @ReactMethod
    fun keepLibraryVideo(id: String?, promise: Promise) {
        submit(keepExecutor, promise) { settle(promise, "keepLibraryVideo") { promise.resolve(keepVideo(id)) } }
    }

    // --- Access ---

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(reactApplicationContext, permission) == PackageManager.PERMISSION_GRANTED

    /**
     * The photos' access, which every list reports; whether videos may be listed beside them; and
     * whether READ_MEDIA_VIDEO itself is granted, which decides the one-time video ask.
     */
    private data class Access(val photos: String, val videoReadable: Boolean, val videoGranted: Boolean)

    private fun currentAccess(): Access {
        val sdk = Build.VERSION.SDK_INT
        val grants = PhotoLibraryCore.Grants(
            images = sdk >= 33 && granted(PhotoLibraryCore.READ_MEDIA_IMAGES),
            videos = sdk >= 33 && granted(PhotoLibraryCore.READ_MEDIA_VIDEO),
            userSelected = sdk >= 34 && granted(PhotoLibraryCore.READ_MEDIA_VISUAL_USER_SELECTED),
            storage = sdk < 33 && granted(PhotoLibraryCore.READ_EXTERNAL_STORAGE),
        )
        return Access(PhotoLibraryCore.photoAccess(sdk, grants), PhotoLibraryCore.videoReadable(sdk, grants), grants.videos)
    }

    /**
     * Runs [body] on the list thread with the access that applies, raising the system prompt first
     * if the user has never been asked — the first list is what asks, so the prompt appears when the
     * attach menu opens rather than at launch. A list that wants videos ([wantsVideo]) also asks, once,
     * a user who granted photos (all, or a selection) to a build that never asked for video.
     *
     * "Asked" is recorded only once the user has answered. A request that never showed a dialog — no
     * activity, or one cancelled because another permission request was in flight — leaves the next
     * list to ask again. The first ask includes video from Android 13, so its answer settles the video
     * ask too.
     */
    private fun withAccess(promise: Promise, wantsVideo: Boolean, body: (Access) -> Unit) {
        val proceed = { access: Access -> submit(listExecutor, promise) { settle(promise, "list") { body(access) } } }
        val sdk = Build.VERSION.SDK_INT
        val access = currentAccess()
        val prefs = reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        when {
            PhotoLibraryCore.shouldAsk(access.photos, prefs.getBoolean(PREF_ASKED, false)) -> requestPermissions { answered ->
                if (answered) {
                    val editor = prefs.edit().putBoolean(PREF_ASKED, true)
                    if (PhotoLibraryCore.asksForVideo(sdk)) editor.putBoolean(PREF_ASKED_VIDEO, true)
                    editor.apply()
                }
                proceed(currentAccess())
            }
            PhotoLibraryCore.shouldAskForVideo(
                sdk,
                videoRequested = wantsVideo,
                photoAccess = access.photos,
                videoGranted = access.videoGranted,
                askedForVideoBefore = prefs.getBoolean(PREF_ASKED_VIDEO, false),
            ) -> requestPermissions { answered ->
                if (answered) prefs.edit().putBoolean(PREF_ASKED_VIDEO, true).apply()
                proceed(currentAccess())
            }
            else -> proceed(access)
        }
    }

    /**
     * Asks for the read permissions — always the whole set for this SDK level, so the system shows its
     * one "photos and videos" dialog rather than a video-only request it may not offer.
     *
     * [then] runs exactly once: with true when the user answered, false when no dialog came of it.
     * React Native's activity keeps a single permission listener, so a request made elsewhere while
     * this one is up replaces it and this answer never arrives; the fallback runs [then] with the
     * access as it stands, inside the web's 60 s timeout, rather than leaving the list unanswered.
     */
    private fun requestPermissions(then: (answered: Boolean) -> Unit) {
        val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
        if (activity == null) {
            then(false)
            return
        }
        val done = AtomicBoolean(false)
        val finish = { answered: Boolean -> if (done.compareAndSet(false, true)) then(answered) }
        val permissions = PhotoLibraryCore.permissionsFor(Build.VERSION.SDK_INT).toTypedArray()
        UiThreadUtil.runOnUiThread {
            activity.requestPermissions(permissions, PERMISSION_REQUEST_CODE, listener@{ requestCode, _, grantResults ->
                if (requestCode != PERMISSION_REQUEST_CODE) return@listener false
                // Empty results are a cancelled request: no dialog was shown, nothing was answered.
                finish(grantResults.isNotEmpty())
                true
            })
        }
        UiThreadUtil.runOnUiThread({ finish(false) }, PERMISSION_FALLBACK_MS)
    }

    // --- Albums ---

    private val imagesCollection: Uri
        get() = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

    private val videoCollection: Uri
        get() = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        }

    private val filesCollection: Uri
        get() = MediaStore.Files.getContentUri(if (Build.VERSION.SDK_INT >= 29) MediaStore.VOLUME_EXTERNAL else "external")

    private fun uriOf(id: Long): Uri = ContentUris.withAppendedId(imagesCollection, id)

    private fun videoUriOf(id: Long): Uri = ContentUris.withAppendedId(videoCollection, id)

    /**
     * Where a list of [types] reads: the images table for photos alone, exactly as before videos, or
     * the files table narrowed by `media_type`. Both name `_id`, `bucket_id`, `date_added`, `width` and
     * `height` alike, so the same column names serve either.
     */
    private data class Source(val uri: Uri, val mediaTypeClause: String?, val readsFiles: Boolean)

    private fun sourceOf(types: MediaTypes): Source =
        if (PhotoLibraryCore.readsFiles(types)) {
            Source(filesCollection, PhotoLibraryCore.mediaTypeClause(types), true)
        } else {
            Source(imagesCollection, null, false)
        }

    /** An album's cover: the item, and its library dimensions, which size a square preview's decode. */
    private data class Cover(val id: Long, val isVideo: Boolean, val width: Int, val height: Int)

    private data class Bucket(val id: String, val title: String, var count: Int, val cover: Cover)

    /**
     * "All photos" first, under the fixed id the web hands back, then one album per folder (bucket),
     * ordered by its newest item. One pass over the library collects all of them; counts and covers
     * cover what the list serves, videos included when it serves them. Covers are square at
     * [thumbSize] when it is set, the uncropped previews of before when not.
     */
    private fun albums(types: MediaTypes, thumbSize: Int?): WritableArray {
        val source = sourceOf(types)
        val projection = listOfNotNull(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            if (source.readsFiles) MediaStore.Files.FileColumns.MEDIA_TYPE else null,
        ).toTypedArray()
        var total = 0
        var newest: Cover? = null
        val buckets = LinkedHashMap<String, Bucket>()
        reactApplicationContext.contentResolver.query(source.uri, projection, source.mediaTypeClause, null, PhotoLibraryCore.SORT_ORDER)?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val bucketColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID)
            val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
            val widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
            val heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
            val typeColumn = if (source.readsFiles) cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE) else -1
            // The row the cursor is on, as a cover — read only for the newest item of the library or an album.
            fun cover() = Cover(
                cursor.getLong(idColumn),
                typeColumn >= 0 && cursor.getInt(typeColumn) == PhotoLibraryCore.MEDIA_TYPE_VIDEO,
                cursor.getInt(widthColumn),
                cursor.getInt(heightColumn),
            )
            while (cursor.moveToNext()) {
                total += 1
                if (newest == null) newest = cover()
                val bucketId = cursor.getString(bucketColumn) ?: continue
                val bucket = buckets.getOrPut(bucketId) { Bucket(bucketId, cursor.getString(nameColumn) ?: "", 0, cover()) }
                bucket.count += 1
            }
        }

        // The library's cover first, then each album's, made in parallel and read back in that order.
        val newestCover = newest
        val bucketList = buckets.values.toList()
        val covers = listOfNotNull(newestCover) + bucketList.map { it.cover }
        val thumbs = PhotoLibraryCore.mapInParallel(covers, previewExecutor) { coverThumbnail(it, thumbSize) }
        val newestThumb = if (newestCover != null) thumbs.first() else null
        val bucketThumbs = thumbs.takeLast(bucketList.size)

        val albums = Arguments.createArray()
        albums.pushMap(Arguments.createMap().apply {
            putString("id", PhotoLibraryCore.ALL_PHOTOS_ALBUM_ID)
            putString("title", reactApplicationContext.getString(R.string.photo_library_all_photos))
            putInt("count", total)
            newestThumb?.let { putString("coverBase64", it) }
        })
        bucketList.forEachIndexed { index, bucket ->
            albums.pushMap(Arguments.createMap().apply {
                putString("id", bucket.id)
                putString("title", bucket.title)
                putInt("count", bucket.count)
                bucketThumbs[index]?.let { putString("coverBase64", it) }
            })
        }
        return albums
    }

    // --- Photos ---

    private data class PageRow(val id: Long, val isVideo: Boolean, val width: Int, val height: Int, val durationMs: Long?)

    /**
     * One page of the list. By cursor ([after]) when [offset] is null, as it always was: the rows older
     * than the key, an item without a preview left out, `next` when more follow. By [offset] otherwise:
     * the same query with no key, the rows at those indices, every one listed — one without a preview
     * with an empty one, so each item stays at its own index — and the page's start and the list's
     * count in place of `next`.
     */
    private fun photos(
        albumId: String?,
        after: String?,
        offset: Int?,
        limit: Int,
        thumbSize: Int?,
        access: String,
        types: MediaTypes,
    ): WritableMap {
        val size = PhotoLibraryCore.pageSize(limit)
        val bucketId = if (PhotoLibraryCore.isAllPhotos(albumId)) null else albumId
        val source = sourceOf(types)
        val key = if (offset == null) PhotoLibraryCore.decode(after) else null
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId, key, source.mediaTypeClause)
        // The duration column is MediaStore's from API 29; below that it is read from the video table.
        val readsDuration = source.readsFiles && Build.VERSION.SDK_INT >= 29
        val projection = listOfNotNull(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            if (source.readsFiles) MediaStore.Files.FileColumns.MEDIA_TYPE else null,
            if (readsDuration) MediaStore.MediaColumns.DURATION else null,
        ).toTypedArray()

        val rows = mutableListOf<PageRow>()
        var last: PhotoLibraryCore.PageKey? = null
        var hasMore = false
        // An album that is gone, or a query that answers nothing, is an empty list: offset 0 of 0.
        var page = PhotoLibraryCore.OffsetPage(0, 0)
        var total = 0
        // No LIMIT clause: API 30+ rejects one in the sort order. A cursor page reads one row past the
        // page to tell whether another follows without counting the whole result; an offset page moves
        // the cursor to its start, which works on every API level.
        reactApplicationContext.contentResolver.query(source.uri, projection, selection, args, PhotoLibraryCore.SORT_ORDER)?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val dateColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            val widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
            val heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
            val typeColumn = if (source.readsFiles) cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE) else -1
            val durationColumn = if (readsDuration) cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DURATION) else -1
            // Reads the row the cursor is on.
            fun readRow() {
                val id = cursor.getLong(idColumn)
                last = PhotoLibraryCore.PageKey(cursor.getLong(dateColumn), id)
                val isVideo = typeColumn >= 0 && cursor.getInt(typeColumn) == PhotoLibraryCore.MEDIA_TYPE_VIDEO
                val duration = if (isVideo && durationColumn >= 0 && !cursor.isNull(durationColumn)) cursor.getLong(durationColumn) else null
                rows += PageRow(id, isVideo, cursor.getInt(widthColumn), cursor.getInt(heightColumn), PhotoLibraryCore.durationMs(duration))
            }
            if (offset != null) {
                total = cursor.count
                page = PhotoLibraryCore.offsetPage(offset, limit, total)
                if (page.start < page.end && cursor.moveToPosition(page.start)) {
                    do {
                        readRow()
                    } while (rows.size < page.end - page.start && cursor.moveToNext())
                }
            } else {
                var read = 0
                while (cursor.moveToNext()) {
                    if (read == size) {
                        hasMore = true
                        break
                    }
                    read += 1
                    readRow()
                }
            }
        }
        val olderDurations = if (source.readsFiles && !readsDuration) videoDurations(rows.filter { it.isVideo }.map { it.id }) else emptyMap()

        // The page's previews are made in parallel; the items are then built in the rows' order.
        val thumbs = PhotoLibraryCore.mapInParallel(rows, previewExecutor) { row ->
            thumbnail(row.id, row.isVideo, thumbSize, row.width, row.height)
        }

        val items = Arguments.createArray()
        for ((index, row) in rows.withIndex()) {
            // A cursor page skips an item whose preview cannot be made rather than drawing a blank
            // tile; an offset page keeps it, since every index there has to be the item at it.
            val thumb = thumbs[index] ?: if (offset != null) "" else continue
            items.pushMap(Arguments.createMap().apply {
                putString("id", PhotoLibraryCore.itemId(row.id, row.isVideo))
                putString("mediaType", if (row.isVideo) "video" else "image")
                putString("thumbBase64", thumb)
                row.width.takeIf { it > 0 }?.let { putInt("width", it) }
                row.height.takeIf { it > 0 }?.let { putInt("height", it) }
                if (row.isVideo) {
                    (row.durationMs ?: olderDurations[row.id])?.let { putDouble("durationMs", it.toDouble()) }
                }
            })
        }

        return Arguments.createMap().apply {
            putString("access", access)
            putArray("items", items)
            if (offset != null) {
                putInt("offset", page.start)
                putInt("total", total)
            } else {
                val lastKey = last
                if (hasMore && lastKey != null) putString("next", PhotoLibraryCore.encode(lastKey))
            }
        }
    }

    /**
     * The lengths of [ids] from the video table, for API 28 and below, where the files table has no
     * public duration column. A length is extra: a failed read leaves the tiles without one.
     */
    private fun videoDurations(ids: List<Long>): Map<Long, Long> {
        if (ids.isEmpty()) return emptyMap()
        val durations = HashMap<Long, Long>()
        try {
            val selection = "${MediaStore.Video.Media._ID} IN (${ids.joinToString(",") { "?" }})"
            val projection = arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.VideoColumns.DURATION)
            reactApplicationContext.contentResolver.query(videoCollection, projection, selection, ids.map { it.toString() }.toTypedArray(), null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    if (cursor.isNull(1)) continue
                    PhotoLibraryCore.durationMs(cursor.getLong(1))?.let { durations[cursor.getLong(0)] = it }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "video durations failed: ${e.javaClass.simpleName}")
        }
        return durations
    }

    private fun coverThumbnail(cover: Cover, thumbSize: Int?): String? =
        thumbnail(cover.id, cover.isVideo, thumbSize, cover.width, cover.height)

    /**
     * A small JPEG preview, upright — a video's is its system thumbnail, a frame chosen by the OS.
     *
     * Without [thumbSize], the preview every list answered before the field: [PhotoLibraryCore.THUMBNAIL_EDGE]
     * on the long edge, uncropped. With it, the centre square at that side: decoded to fit a box whose
     * side brings the short edge to [thumbSize] ([PhotoLibraryCore.fitBox], from the library's [width]
     * and [height]), then cropped and scaled by what was actually decoded.
     */
    private fun thumbnail(id: Long, isVideo: Boolean, thumbSize: Int?, width: Int, height: Int): String? = try {
        if (thumbSize == null) {
            loadPreview(id, isVideo, PhotoLibraryCore.THUMBNAIL_EDGE)?.let { base64Jpeg(it, 70).also { _ -> it.recycle() } }
        } else {
            loadPreview(id, isVideo, PhotoLibraryCore.fitBox(width, height, thumbSize))?.let { decoded ->
                val square = squarePreview(decoded, thumbSize)
                base64Jpeg(square, PhotoLibraryCore.SIZED_JPEG_QUALITY).also { _ -> square.recycle() }
            }
        }
    } catch (e: Exception) {
        null
    }

    /** The item decoded upright to fit within an [edge] × [edge] box. */
    private fun loadPreview(id: Long, isVideo: Boolean, edge: Int): Bitmap? = when {
        Build.VERSION.SDK_INT >= 29 ->
            reactApplicationContext.contentResolver.loadThumbnail(if (isVideo) videoUriOf(id) else uriOf(id), Size(edge, edge), null)
        isVideo -> legacyVideoThumbnail(id, edge)
        else -> decodeUpright(uriOf(id), edge)
    }

    /**
     * The centre square of [decoded], at [size] a side or the square's own side when that is smaller.
     * Takes [decoded] over: every bitmap but the one returned is recycled, [decoded] included.
     */
    private fun squarePreview(decoded: Bitmap, size: Int): Bitmap {
        val crop = PhotoLibraryCore.centerSquare(decoded.width, decoded.height)
        val side = PhotoLibraryCore.squareSide(size, crop.side, crop.side)
        // Either call may hand back the bitmap it was given when there is nothing to change.
        val cropped = try {
            Bitmap.createBitmap(decoded, crop.x, crop.y, crop.side, crop.side)
        } catch (e: Throwable) {
            decoded.recycle()
            throw e
        }
        val scaled = try {
            Bitmap.createScaledBitmap(cropped, side, side, true)
        } catch (e: Throwable) {
            if (cropped !== decoded) cropped.recycle()
            decoded.recycle()
            throw e
        }
        if (cropped !== scaled && cropped !== decoded) cropped.recycle()
        if (decoded !== scaled) decoded.recycle()
        return scaled
    }

    /**
     * A video's preview before API 29, which has no `loadThumbnail`: MediaStore's own thumbnail (made
     * once and cached by the system, read by id, so no file path is needed), scaled down to [edge].
     */
    @Suppress("DEPRECATION")
    private fun legacyVideoThumbnail(id: Long, edge: Int): Bitmap? {
        val full = MediaStore.Video.Thumbnails.getThumbnail(
            reactApplicationContext.contentResolver,
            id,
            MediaStore.Video.Thumbnails.MINI_KIND,
            null,
        ) ?: return null
        val (width, height) = PhotoLibraryCore.decodeTarget(full.width, full.height, edge) ?: return full
        return Bitmap.createScaledBitmap(full, width, height, true).also { if (it !== full) full.recycle() }
    }

    // --- Read ---

    private data class Row(val mimeType: String?, val displayName: String?, val width: Int, val height: Int, val size: Long)

    private fun row(id: Long): Row? {
        val projection = arrayOf(
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            MediaStore.Images.Media.SIZE,
        )
        return reactApplicationContext.contentResolver.query(uriOf(id), projection, null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) return null
            Row(cursor.getString(0), cursor.getString(1), cursor.getInt(2), cursor.getInt(3), cursor.getLong(4))
        }
    }

    private fun read(rawId: String): WritableMap {
        val id = rawId.toLongOrNull() ?: throw Rejection("INVALID", "id is not a photo id")
        val row = row(id) ?: throw Rejection("PHOTO_MISSING", "The photo is no longer in the library")
        val export = PhotoLibraryCore.export(row.mimeType)
        if (PhotoLibraryCore.tooLargeToSend(row.size, export)) {
            throw Rejection("READ_FAILED", "The photo is larger than a chat image may be")
        }

        val (bytes, mimeType, extension) = prepare(uriOf(id), export, row)
            ?: throw Rejection("READ_FAILED", "The photo could not be converted")

        return Arguments.createMap().apply {
            putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            putString("mimeType", mimeType)
            putString("fileName", PhotoLibraryCore.fileName(row.displayName, extension))
            if (row.width > 0) putInt("width", row.width)
            if (row.height > 0) putInt("height", row.height)
        }
    }

    // --- Keep a video ---

    /**
     * The video [rawId] names, copied and judged by the attachment picker's own code ([PickedCopies]).
     * A refusal leaves no folder behind. A pick folder made here is swept with the picker's, 24 hours
     * after its last change.
     */
    private fun keepVideo(rawId: String?): WritableMap {
        val id = PhotoLibraryCore.videoId(rawId) ?: throw Rejection("INVALID", "id is not a library video id")
        val uri = videoUriOf(id)
        val mimeType = videoRow(id).mimeType
        val described = copies.describe(uri)
        val name = AttachPickRules.pickedName(
            AttachPickRules.safeName(described.displayName, "video"),
            Kind.VIDEO,
            described.takenAtMs,
            System.currentTimeMillis(),
            TimeZone.getDefault(),
        )
        copies.sweep()
        val folder = copies.newFolder()
        try {
            val kept = when (val copied = copies.copy(uri, folder, name, described.size, AttachPickRules.VIDEO_MAX_BYTES)) {
                is PickedCopies.Copied.Kept -> copied
                PickedCopies.Copied.TooLarge -> throw Rejection("TOO_LARGE", "The video is larger than a chat video may be")
                PickedCopies.Copied.Unreadable -> throw Rejection("READ_FAILED", "The video could not be copied")
            }
            val check = try {
                copies.checkVideo(kept.file)
            } catch (e: Exception) {
                // A container the extractor chokes on, rather than one it reads and refuses.
                PickedCopies.VideoCheck.Unsupported("the video cannot be read as an MP4")
            }
            when (check) {
                is PickedCopies.VideoCheck.Sendable -> Unit
                is PickedCopies.VideoCheck.Unsupported -> throw Rejection("UNSUPPORTED", check.reason)
                PickedCopies.VideoCheck.Unreadable -> throw Rejection("READ_FAILED", "The copied video could not be read")
            }
            return copies.keptItem(Kind.VIDEO, kept.file, name, mimeType, kept.size)
        } catch (e: Throwable) {
            folder.deleteRecursively()
            throw e
        }
    }

    private class VideoRow(val mimeType: String?)

    /**
     * The video's row, which is also the check that it is still in the library: none is
     * `PHOTO_MISSING`. A read the permission no longer covers is `READ_FAILED` — the row may well be
     * there.
     */
    private fun videoRow(id: Long): VideoRow {
        val projection = arrayOf(MediaStore.Video.Media.MIME_TYPE)
        val row = try {
            reactApplicationContext.contentResolver.query(videoUriOf(id), projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) VideoRow(cursor.getString(0)) else null
            }
        } catch (e: SecurityException) {
            throw Rejection("READ_FAILED", "The library cannot be read")
        }
        return row ?: throw Rejection("PHOTO_MISSING", "The video is no longer in the library")
    }

    /** The library's bytes in the form [PhotoLibraryCore.export] chose — see [PhotoPreparer.prepare]. */
    private fun prepare(uri: Uri, export: Export, row: Row): Triple<ByteArray, String, String>? =
        preparer.prepare(uri, export, row.width, row.height)?.let { Triple(it.bytes, it.mimeType, it.extension) }

    private fun decodeUpright(uri: Uri, maxEdge: Int?): Bitmap? = preparer.decodeUpright(uri, maxEdge)

    private fun base64Jpeg(bitmap: Bitmap, quality: Int): String =
        Base64.encodeToString(preparer.encodeJpeg(bitmap, quality), Base64.NO_WRAP)
}
