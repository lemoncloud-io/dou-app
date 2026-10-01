package io.chatic.dou.module

import android.Manifest
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.chatic.dou.R
import io.chatic.dou.transfer.core.DownloadFiles
import io.chatic.dou.transfer.core.TransferRules
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.util.concurrent.Executors

/**
 * MediaExport — hands a file the transfer module downloaded to an OS surface: the photo library
 * (`Pictures/DoU`) or the share sheet.
 *
 * It accepts only committed files inside the download folder ([DownloadFiles.checkExportable]) and
 * only images, told by their bytes ([DownloadFiles.sniffImage]). Rejections use the codes of the
 * `SaveToPhotoLibrary` / `ShareFile` contract as the promise rejection code, so JS passes them on.
 *
 * Asking for storage permission on API 24–28 is left to JS (`PermissionsAndroid`), which already
 * owns the Activity-result plumbing; this module only checks that it was granted.
 */
class MediaExportModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "MediaExport"
        private const val ALBUM = "DoU"
    }

    /** File I/O stays off the RN module thread; one thread keeps saves in the order they were asked. */
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "media-export").apply { isDaemon = true }
    }

    private class Rejection(val code: String, message: String) : Exception(message)

    override fun getName(): String = "MediaExport"

    override fun invalidate() {
        executor.shutdown()
        super.invalidate()
    }

    @ReactMethod
    fun saveToPhotoLibrary(uri: String?, promise: Promise) {
        executor.execute {
            settle(promise) {
                val (file, type) = exportableImage(uri)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) insertIntoMediaStore(file, type) else copyToPublicPictures(file, type)
                // Saved, so the shell's copy has done its job.
                removeCommitted(file)
                Arguments.createMap().apply { putString("mimeType", type.mimeType) }
            }
        }
    }

    @ReactMethod
    fun shareFile(uri: String?, title: String?, promise: Promise) {
        executor.execute {
            try {
                val (file, type) = exportableImage(uri)
                val activity = reactApplicationContext.currentActivity
                    ?: throw Rejection("INTERNAL", "there is no screen to show the share sheet on")
                val contentUri = try {
                    FileProvider.getUriForFile(reactApplicationContext, "${reactApplicationContext.packageName}.share.fileprovider", file)
                } catch (_: IllegalArgumentException) {
                    throw Rejection("INVALID", "the file is outside the shared folder")
                }
                // The file alone, no text: a receiving app offered both tends to send the text only.
                // ClipData carries the read grant to the chooser's preview and to the chosen app.
                val send = Intent(Intent.ACTION_SEND).apply {
                    setType(type.mimeType)
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    clipData = ClipData.newRawUri(null, contentUri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(send, title?.takeIf { it.isNotBlank() } ?: reactApplicationContext.getString(R.string.media_share_chooser_title))
                activity.runOnUiThread {
                    try {
                        activity.startActivity(chooser)
                        // Android does not report what the user picked, so the answer is "shown".
                        promise.resolve(Arguments.createMap().apply { putNull("completed") })
                    } catch (e: Exception) {
                        promise.reject("INTERNAL", describe(e))
                    }
                }
            } catch (e: Rejection) {
                promise.reject(e.code, e.message)
            } catch (e: Exception) {
                Log.w(TAG, "share failed", e)
                promise.reject("INTERNAL", describe(e))
            }
        }
    }

    // ---- Checks ---------------------------------------------------------------------------------

    private fun exportableImage(uri: String?): Pair<File, DownloadFiles.ImageType> {
        val file = when (val check = DownloadFiles.checkExportable(uri, File(reactApplicationContext.cacheDir, DownloadFiles.FOLDER))) {
            is DownloadFiles.ExportCheck.Accepted -> check.file
            is DownloadFiles.ExportCheck.Invalid -> throw Rejection("INVALID", check.reason)
            DownloadFiles.ExportCheck.Missing -> throw Rejection("SOURCE", "the file no longer exists")
        }
        val head = try {
            readHead(file)
        } catch (e: IOException) {
            throw Rejection("SOURCE", "the file cannot be read: ${describe(e)}")
        }
        val type = DownloadFiles.sniffImage(head) ?: throw Rejection("UNSUPPORTED_TYPE", "the file is not a PNG, JPEG, GIF or WebP image")
        return file to type
    }

    // ---- Saving ---------------------------------------------------------------------------------

    /**
     * API 29+: the app's own media needs no permission. The row is inserted pending so the gallery
     * never shows a half-written image, and deleted if the copy fails so no empty entry is left.
     * MediaStore picks a free name (` (1)`) when this one is taken.
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun insertIntoMediaStore(file: File, type: DownloadFiles.ImageType) {
        val resolver = reactApplicationContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, file.name)
            put(MediaStore.Images.Media.MIME_TYPE, type.mimeType)
            put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$ALBUM")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val item = resolver.insert(collection, values) ?: throw Rejection("INTERNAL", "the media store refused a new image")
        try {
            val output = resolver.openOutputStream(item) ?: throw IOException("the media store gave no stream")
            output.use { out -> FileInputStream(file).use { it.copyTo(out) } }
            val published = resolver.update(item, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            // A row left pending stays hidden from the gallery and is purged later: not a save.
            if (published < 1) throw Rejection("INTERNAL", "the media store did not publish the image")
        } catch (e: Exception) {
            resolver.delete(item, null, null)
            throw e
        }
    }

    /** API 24–28: a copy under the public Pictures folder, then a scan so the gallery lists it. */
    @Suppress("DEPRECATION")
    private fun copyToPublicPictures(file: File, type: DownloadFiles.ImageType) {
        val granted = ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) throw Rejection("PERMISSION_DENIED", "storage permission is not granted")
        val album = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM)
        if (!album.isDirectory && !album.mkdirs()) throw IOException("cannot create the album folder")
        val target = File(album, DownloadFiles.uniqueName(file.name) { File(album, it).exists() })
        try {
            FileInputStream(file).use { input -> target.outputStream().use { input.copyTo(it) } }
        } catch (e: Exception) {
            target.delete()
            throw e
        }
        MediaScannerConnection.scanFile(reactApplicationContext, arrayOf(target.path), arrayOf(type.mimeType), null)
    }

    // ---- Internals ------------------------------------------------------------------------------

    /** Deletes the saved file and its transfer folder — but never the download folder itself. */
    private fun removeCommitted(file: File) {
        file.delete()
        val parent = file.parentFile ?: return
        val root = File(reactApplicationContext.cacheDir, DownloadFiles.FOLDER).canonicalFile
        if (parent.canonicalFile != root && parent.list()?.isEmpty() == true) parent.delete()
    }

    private fun settle(promise: Promise, block: () -> Any?) {
        try {
            promise.resolve(block())
        } catch (e: Rejection) {
            promise.reject(e.code, e.message)
        } catch (e: Exception) {
            Log.w(TAG, "save failed", e)
            promise.reject("INTERNAL", describe(e))
        }
    }

    private fun readHead(file: File): ByteArray =
        FileInputStream(file).use { stream ->
            val head = ByteArray(DownloadFiles.SNIFF_BYTES)
            var total = 0
            while (total < head.size) {
                val read = stream.read(head, total, head.size - total)
                if (read < 0) break
                total += read
            }
            head.copyOf(total)
        }

    /** An exception as a short message, with any path-like URL removed. */
    private fun describe(e: Exception): String =
        TransferRules.sanitizeMessage("${e.javaClass.simpleName}: ${e.message.orEmpty()}").orEmpty()
}
