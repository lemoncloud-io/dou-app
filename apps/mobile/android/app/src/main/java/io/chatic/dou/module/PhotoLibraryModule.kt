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
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import io.chatic.dou.photo.PhotoPreparer
import io.chatic.dou.photo.core.PhotoLibraryCore
import io.chatic.dou.photo.core.PhotoLibraryCore.Export
import io.chatic.dou.R
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * PhotoLibrary — reads the device photo library (MediaStore) for the web's in-app picker: albums,
 * pages of previews, and the bytes of a picked photo.
 *
 * Only still images are listed. Everything crosses as base64 because the WebView cannot open a
 * `content://` URI; the ids are handed to the web only to be handed back.
 *
 * Rejection codes never include `NOT_FOUND`: the web reads that code as "this app has no photo
 * library" and stops asking for the rest of the session, so a deleted photo must not look like it.
 */
class PhotoLibraryModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PhotoLibrary"
        private const val PREFS = "photo_library"
        private const val PREF_ASKED = "asked"
        private const val PERMISSION_REQUEST_CODE = 0x5048 // "PH"
        private const val PERMISSION_FALLBACK_MS = 50_000L
    }

    private class Rejection(val code: String, message: String) : Exception(message)

    // Lists run one at a time: the web drops a page it no longer wants but cannot cancel it, so
    // overlapping pages would only compete. Reads have their own thread so a send does not wait
    // behind a page of previews.
    private val listExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val readExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    private val preparer = PhotoPreparer(reactContext)

    override fun getName(): String = "PhotoLibrary"

    override fun invalidate() {
        listExecutor.shutdown()
        readExecutor.shutdown()
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
    fun listAlbums(promise: Promise) {
        withAccess(promise) { access ->
            val reply = Arguments.createMap()
            reply.putString("access", access)
            reply.putArray("albums", if (access == "denied") Arguments.createArray() else albums())
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

        withAccess(promise) { access ->
            if (access == "denied") {
                promise.resolve(Arguments.createMap().apply {
                    putString("access", access)
                    putArray("items", Arguments.createArray())
                })
            } else {
                promise.resolve(photos(albumId, after, limit, access))
            }
        }
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
        val current = currentAccess()
        if (current != "limited") {
            promise.resolve(current)
            return
        }
        requestPermissions { _ -> promise.resolve(currentAccess()) }
    }

    // --- Access ---

    private fun granted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(reactApplicationContext, permission) == PackageManager.PERMISSION_GRANTED

    private fun currentAccess(): String {
        val sdk = Build.VERSION.SDK_INT
        val full = if (sdk >= 33) granted(PhotoLibraryCore.READ_MEDIA_IMAGES) else granted(PhotoLibraryCore.READ_EXTERNAL_STORAGE)
        val partial = sdk >= 34 && granted(PhotoLibraryCore.READ_MEDIA_VISUAL_USER_SELECTED)
        return PhotoLibraryCore.access(full, partial)
    }

    /**
     * Runs [body] on the list thread with the access that applies, raising the system prompt first
     * if the user has never been asked — the first list is what asks, so the prompt appears when the
     * attach menu opens rather than at launch.
     *
     * "Asked" is recorded only once the user has answered. A request that never showed a dialog — no
     * activity, or one cancelled because another permission request was in flight — leaves the next
     * list to ask again.
     */
    private fun withAccess(promise: Promise, body: (String) -> Unit) {
        val proceed = { access: String -> submit(listExecutor, promise) { settle(promise, "list") { body(access) } } }
        val access = currentAccess()
        val prefs = reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!PhotoLibraryCore.shouldAsk(access, prefs.getBoolean(PREF_ASKED, false))) {
            proceed(access)
            return
        }
        requestPermissions { answered ->
            if (answered) prefs.edit().putBoolean(PREF_ASKED, true).apply()
            proceed(currentAccess())
        }
    }

    /**
     * Asks for the read permissions. [then] runs exactly once: with true when the user answered, false
     * when no dialog came of it. React Native's activity keeps a single permission listener, so a
     * request made elsewhere while this one is up replaces it and this answer never arrives; the
     * fallback runs [then] with the access as it stands, inside the web's 60 s timeout, rather than
     * leaving the list unanswered.
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

    private val collection: Uri
        get() = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

    private fun uriOf(id: Long): Uri = ContentUris.withAppendedId(collection, id)

    private data class Bucket(val id: String, val title: String, var count: Int, val coverId: Long)

    /**
     * "All photos" first, under the fixed id the web hands back, then one album per folder (bucket),
     * ordered by its newest photo. One pass over the library collects all of them.
     */
    private fun albums(): WritableArray {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.BUCKET_ID,
            MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
        )
        var total = 0
        var newestId: Long? = null
        val buckets = LinkedHashMap<String, Bucket>()
        reactApplicationContext.contentResolver.query(collection, projection, null, null, PhotoLibraryCore.SORT_ORDER)?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val bucketColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID)
            val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
            while (cursor.moveToNext()) {
                val id = cursor.getLong(idColumn)
                total += 1
                if (newestId == null) newestId = id
                val bucketId = cursor.getString(bucketColumn) ?: continue
                val bucket = buckets.getOrPut(bucketId) { Bucket(bucketId, cursor.getString(nameColumn) ?: "", 0, id) }
                bucket.count += 1
            }
        }

        val albums = Arguments.createArray()
        albums.pushMap(Arguments.createMap().apply {
            putString("id", PhotoLibraryCore.ALL_PHOTOS_ALBUM_ID)
            putString("title", reactApplicationContext.getString(R.string.photo_library_all_photos))
            putInt("count", total)
            newestId?.let { id -> thumbnail(id)?.let { putString("coverBase64", it) } }
        })
        for (bucket in buckets.values) {
            albums.pushMap(Arguments.createMap().apply {
                putString("id", bucket.id)
                putString("title", bucket.title)
                putInt("count", bucket.count)
                thumbnail(bucket.coverId)?.let { putString("coverBase64", it) }
            })
        }
        return albums
    }

    // --- Photos ---

    private fun photos(albumId: String?, after: String?, limit: Int, access: String): WritableMap {
        val size = PhotoLibraryCore.pageSize(limit)
        val bucketId = if (PhotoLibraryCore.isAllPhotos(albumId)) null else albumId
        val (selection, args) = PhotoLibraryCore.pageSelection(bucketId, PhotoLibraryCore.decode(after))
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
        )

        val items = Arguments.createArray()
        var last: PhotoLibraryCore.PageKey? = null
        var hasMore = false
        // No LIMIT clause: API 30+ rejects one in the sort order, and reading one row past the page
        // tells whether another page follows without counting the whole result.
        reactApplicationContext.contentResolver.query(collection, projection, selection, args, PhotoLibraryCore.SORT_ORDER)?.use { cursor ->
            val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val dateColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            val widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
            val heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
            var read = 0
            while (cursor.moveToNext()) {
                if (read == size) {
                    hasMore = true
                    break
                }
                read += 1
                val id = cursor.getLong(idColumn)
                last = PhotoLibraryCore.PageKey(cursor.getLong(dateColumn), id)
                // A photo whose preview cannot be made is skipped rather than drawn as a blank tile.
                val thumb = thumbnail(id) ?: continue
                items.pushMap(Arguments.createMap().apply {
                    putString("id", id.toString())
                    putString("thumbBase64", thumb)
                    cursor.getInt(widthColumn).takeIf { it > 0 }?.let { putInt("width", it) }
                    cursor.getInt(heightColumn).takeIf { it > 0 }?.let { putInt("height", it) }
                })
            }
        }

        return Arguments.createMap().apply {
            putString("access", access)
            putArray("items", items)
            val key = last
            if (hasMore && key != null) putString("next", PhotoLibraryCore.encode(key))
        }
    }

    /** A small JPEG preview, upright. */
    private fun thumbnail(id: Long): String? = try {
        val edge = PhotoLibraryCore.THUMBNAIL_EDGE
        val bitmap = if (Build.VERSION.SDK_INT >= 29) {
            reactApplicationContext.contentResolver.loadThumbnail(uriOf(id), Size(edge, edge), null)
        } else {
            decodeUpright(uriOf(id), edge)
        }
        bitmap?.let { base64Jpeg(it, 70).also { _ -> it.recycle() } }
    } catch (e: Exception) {
        null
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

    /** The library's bytes in the form [PhotoLibraryCore.export] chose — see [PhotoPreparer.prepare]. */
    private fun prepare(uri: Uri, export: Export, row: Row): Triple<ByteArray, String, String>? =
        preparer.prepare(uri, export, row.width, row.height)?.let { Triple(it.bytes, it.mimeType, it.extension) }

    private fun decodeUpright(uri: Uri, maxEdge: Int?): Bitmap? = preparer.decodeUpright(uri, maxEdge)

    private fun base64Jpeg(bitmap: Bitmap, quality: Int): String =
        Base64.encodeToString(preparer.encodeJpeg(bitmap, quality), Base64.NO_WRAP)
}
