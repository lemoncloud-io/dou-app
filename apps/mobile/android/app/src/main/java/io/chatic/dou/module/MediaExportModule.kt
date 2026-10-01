package io.chatic.dou.module

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
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
import io.chatic.dou.media.core.ExportFormats
import io.chatic.dou.transfer.core.DownloadFiles
import io.chatic.dou.transfer.core.TransferRules
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.util.concurrent.Executors

/**
 * MediaExport — hands a file the transfer module downloaded to an OS surface: the photo library
 * (`Pictures/DoU`, `Movies/DoU`), the share sheet, the app the system opens it with, or the device's
 * downloads (`Download/DoU`).
 *
 * It accepts only committed files inside the download folder ([DownloadFiles.checkExportable]), and
 * only the byte families [ExportFormats.family] knows — the photo library only images and MP4.
 * Rejections use the codes of the media-export contract as the promise rejection code, so JS passes
 * them on.
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
                val file = exportable(uri)
                val mimeType = ExportFormats.photoLibraryType(head(file))
                    ?: throw Rejection("UNSUPPORTED_TYPE", "the file is not a PNG, JPEG, GIF or WebP image, or an MP4 video")
                val video = mimeType == "video/mp4"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val collection = if (video) {
                        MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    } else {
                        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    }
                    val directory = if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES
                    insertIntoMediaStore(file, file.name, mimeType, collection, "$directory/$ALBUM")
                } else {
                    copyToPublicFolder(file, mimeType, if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES)
                }
                // Saved, so the shell's copy has done its job.
                removeCommitted(file)
                Arguments.createMap().apply { putString("mimeType", mimeType) }
            }
        }
    }

    @ReactMethod
    fun shareFile(uri: String?, title: String?, promise: Promise) {
        executor.execute {
            try {
                val (file, mimeType) = exportableDocument(uri)
                val activity = reactApplicationContext.currentActivity
                    ?: throw Rejection("INTERNAL", "there is no screen to show the share sheet on")
                val contentUri = contentUriOf(file)
                // The file alone, no text: a receiving app offered both tends to send the text only.
                // ClipData carries the read grant to the chooser's preview and to the chosen app.
                val send = Intent(Intent.ACTION_SEND).apply {
                    setType(mimeType)
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

    /**
     * Opens a downloaded file in the app the system picks for `ACTION_VIEW`, answering once that app
     * is started. The intent goes to `startActivity` as it is, never through `createChooser`: wrapped
     * in a chooser, a format nothing opens (HWP, usually) shows a dead-end "no apps can perform this
     * action" sheet instead of throwing, and the web could not fall back to the share sheet. Asking the
     * package manager first would need a `<queries>` declaration on API 30+.
     */
    @ReactMethod
    fun openFile(uri: String?, promise: Promise) {
        executor.execute {
            try {
                val (file, mimeType) = exportableDocument(uri)
                val activity = reactApplicationContext.currentActivity
                    ?: throw Rejection("INTERNAL", "there is no screen to open the file from")
                val view = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUriOf(file), mimeType)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.runOnUiThread {
                    try {
                        activity.startActivity(view)
                        promise.resolve(Arguments.createMap())
                    } catch (e: ActivityNotFoundException) {
                        promise.reject("NO_HANDLER", "no app on this device opens $mimeType")
                    } catch (e: Exception) {
                        promise.reject("INTERNAL", describe(e))
                    }
                }
            } catch (e: Rejection) {
                promise.reject(e.code, e.message)
            } catch (e: Exception) {
                Log.w(TAG, "open failed", e)
                promise.reject("INTERNAL", describe(e))
            }
        }
    }

    /**
     * Keeps a downloaded file in the device's downloads under [name], and answers where it went. The
     * downloaded file stays in the shell's folder, so the web can still open it afterwards.
     */
    @ReactMethod
    fun saveFile(uri: String?, name: String?, promise: Promise) {
        executor.execute {
            settle(promise) {
                val saveName = ExportFormats.saveName(name)
                    ?: throw Rejection("INVALID", "the name has no extension of a format the server stores")
                // The bytes are judged as for sharing, so an error page saved under a `.pdf` name stays in.
                val (file, _) = exportableDocument(uri)
                val mimeType = ExportFormats.mimeTypeForName(saveName) ?: throw Rejection("INVALID", "the name has no known type")
                val folder = "${Environment.DIRECTORY_DOWNLOADS}/$ALBUM"
                val savedName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    insertIntoMediaStore(file, saveName, mimeType, collection, folder)
                } else {
                    copyToPublicFolder(file, mimeType, Environment.DIRECTORY_DOWNLOADS, saveName)
                }
                Arguments.createMap().apply {
                    putBoolean("saved", true)
                    putString("location", ExportFormats.saveLocation(folder, savedName))
                }
            }
        }
    }

    // ---- Checks ---------------------------------------------------------------------------------

    private fun exportable(uri: String?): File =
        when (val check = DownloadFiles.checkExportable(uri, File(reactApplicationContext.cacheDir, DownloadFiles.FOLDER))) {
            is DownloadFiles.ExportCheck.Accepted -> check.file
            is DownloadFiles.ExportCheck.Invalid -> throw Rejection("INVALID", check.reason)
            DownloadFiles.ExportCheck.Missing -> throw Rejection("SOURCE", "the file no longer exists")
        }

    /** A file of a family the shell lets out, with the type its name gives it. */
    private fun exportableDocument(uri: String?): Pair<File, String> {
        val file = exportable(uri)
        val family = ExportFormats.family(head(file), file.name)
            ?: throw Rejection("UNSUPPORTED_TYPE", "the file is not an image, an MP4, or a document the server stores")
        return file to ExportFormats.mimeType(file.name, family)
    }

    private fun head(file: File): ByteArray = try {
        readHead(file, ExportFormats.SNIFF_BYTES)
    } catch (e: IOException) {
        throw Rejection("SOURCE", "the file cannot be read: ${describe(e)}")
    }

    private fun contentUriOf(file: File): Uri = try {
        FileProvider.getUriForFile(reactApplicationContext, "${reactApplicationContext.packageName}.share.fileprovider", file)
    } catch (_: IllegalArgumentException) {
        throw Rejection("INVALID", "the file is outside the shared folder")
    }

    // ---- Saving ---------------------------------------------------------------------------------

    /**
     * API 29+: the app's own media and downloads need no permission. The row is inserted pending so
     * the gallery or Files never shows a half-written file, and deleted if the copy fails so no empty
     * entry is left. When [name] is taken, the media store numbers it (`name (1).pdf`) — but only once
     * the row is published, so the name is read back afterwards and returned.
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private fun insertIntoMediaStore(file: File, name: String, mimeType: String, collection: Uri, relativePath: String): String {
        val resolver = reactApplicationContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val item = resolver.insert(collection, values) ?: throw Rejection("INTERNAL", "the media store refused a new entry")
        try {
            val output = resolver.openOutputStream(item) ?: throw IOException("the media store gave no stream")
            output.use { out -> FileInputStream(file).use { it.copyTo(out) } }
            val published = resolver.update(item, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            // A row left pending stays hidden and is purged later: not a save.
            if (published < 1) throw Rejection("INTERNAL", "the media store did not publish the file")
        } catch (e: Exception) {
            resolver.delete(item, null, null)
            throw e
        }
        return try {
            resolver.query(item, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        } catch (e: Exception) {
            null
        } ?: name
    }

    /**
     * API 24–28: a copy under a public folder's `DoU`, then a scan so the gallery and Files list it.
     * That folder overwrites a file of the same name without a word, so a taken name is numbered here
     * (`name (1).pdf`). Returns the name the copy got.
     */
    @Suppress("DEPRECATION")
    private fun copyToPublicFolder(file: File, mimeType: String, directory: String, name: String = file.name): String {
        val granted = ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) throw Rejection("PERMISSION_DENIED", "storage permission is not granted")
        val album = File(Environment.getExternalStoragePublicDirectory(directory), ALBUM)
        if (!album.isDirectory && !album.mkdirs()) throw IOException("cannot create the $ALBUM folder")
        val target = File(album, DownloadFiles.uniqueName(name) { File(album, it).exists() })
        try {
            FileInputStream(file).use { input -> target.outputStream().use { input.copyTo(it) } }
        } catch (e: Exception) {
            target.delete()
            throw e
        }
        MediaScannerConnection.scanFile(reactApplicationContext, arrayOf(target.path), arrayOf(mimeType), null)
        return target.name
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

    private fun readHead(file: File, size: Int): ByteArray =
        FileInputStream(file).use { stream ->
            val head = ByteArray(size)
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
