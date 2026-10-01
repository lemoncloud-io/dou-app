package io.chatic.dou.module

import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.chatic.dou.file.TempFileName
import io.chatic.dou.transfer.core.UploadSources
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.concurrent.thread

class FileManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "FileManager"
    }

    override fun getConstants(): Map<String, Any>? {
        return mapOf(
            "DocumentDirectoryPath" to reactApplicationContext.filesDir.absolutePath,
            // The folder an upload may read a `WriteTempFile` file from; the debug screen's dummy files go here too.
            "TransferTempPath" to File(reactApplicationContext.cacheDir, UploadSources.TEMP_FOLDER).absolutePath
        )
    }

    private fun getCleanPath(path: String): String {
        var clean = path
        if (clean.startsWith("file://")) {
            clean = clean.substring(7)
        }
        return Uri.decode(clean)
    }

    @ReactMethod
    fun exists(path: String, promise: Promise) {
        try {
            val uri = Uri.parse(path)
            if (uri.scheme == "content") {
                reactApplicationContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use {
                    promise.resolve(true)
                    return
                }
                promise.resolve(false)
            } else {
                val cleanPath = getCleanPath(path)
                val file = File(cleanPath)
                promise.resolve(file.exists())
            }
        } catch (e: Exception) {
            // If opening AssetFileDescriptor throws, it likely doesn't exist
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun readChunk(path: String, length: Double, offset: Double, promise: Promise) {
        try {
            val uri = Uri.parse(path)
            if (uri.scheme == "content") {
                reactApplicationContext.contentResolver.openInputStream(uri)?.use { stream ->
                    val skipped = stream.skip(offset.toLong())
                    val buffer = ByteArray(length.toInt())
                    val bytesRead = stream.read(buffer)
                    if (bytesRead <= 0) {
                        promise.resolve("")
                        return
                    }
                    val actualBuffer = if (bytesRead < length.toInt()) {
                        buffer.copyOf(bytesRead)
                    } else {
                        buffer
                    }
                    val base64 = Base64.encodeToString(actualBuffer, Base64.NO_WRAP)
                    promise.resolve(base64)
                } ?: throw Exception("Failed to open input stream for content URI: $path")
            } else {
                val cleanPath = getCleanPath(path)
                val file = File(cleanPath)
                if (!file.exists()) {
                    throw Exception("File does not exist at path: $cleanPath")
                }
                RandomAccessFile(file, "r").use { raf ->
                    raf.seek(offset.toLong())
                    val buffer = ByteArray(length.toInt())
                    val bytesRead = raf.read(buffer)
                    if (bytesRead <= 0) {
                        promise.resolve("")
                        return
                    }
                    val actualBuffer = if (bytesRead < length.toInt()) {
                        buffer.copyOf(bytesRead)
                    } else {
                        buffer
                    }
                    val base64 = Base64.encodeToString(actualBuffer, Base64.NO_WRAP)
                    promise.resolve(base64)
                }
            }
        } catch (e: Exception) {
            promise.reject("READ_CHUNK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun readFile(path: String, promise: Promise) {
        try {
            val uri = Uri.parse(path)
            val bytes = if (uri.scheme == "content") {
                reactApplicationContext.contentResolver.openInputStream(uri)?.use { stream ->
                    stream.readBytes()
                } ?: throw Exception("Failed to open input stream for content URI: $path")
            } else {
                val cleanPath = getCleanPath(path)
                val file = File(cleanPath)
                if (!file.exists()) {
                    throw Exception("File does not exist at path: $cleanPath")
                }
                file.readBytes()
            }
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            promise.resolve(base64)
        } catch (e: Exception) {
            promise.reject("READ_FILE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun unlink(path: String, promise: Promise) {
        try {
            val uri = Uri.parse(path)
            if (uri.scheme == "content") {
                val deleted = reactApplicationContext.contentResolver.delete(uri, null, null)
                promise.resolve(deleted > 0)
            } else {
                val cleanPath = getCleanPath(path)
                val file = File(cleanPath)
                if (file.exists()) {
                    val success = file.deleteRecursively()
                    promise.resolve(success)
                } else {
                    promise.resolve(false)
                }
            }
        } catch (e: Exception) {
            promise.reject("UNLINK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun downloadFile(url: String, toPath: String, promise: Promise) {
        thread {
            val cleanPath = getCleanPath(toPath)
            val file = File(cleanPath)
            var connection: HttpURLConnection? = null
            try {
                connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.instanceFollowRedirects = true
                val responseCode = connection.responseCode
                if (responseCode < 200 || responseCode >= 300) {
                    promise.reject("DOWNLOAD_FAILED", "HTTP $responseCode")
                    return@thread
                }
                file.parentFile?.mkdirs()
                if (file.exists()) {
                    file.delete()
                }
                connection.inputStream.use { input ->
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                    }
                }
                promise.resolve(file.absolutePath)
            } catch (e: Exception) {
                try {
                    file.delete()
                } catch (ignored: Exception) {
                    // ignore cleanup errors
                }
                promise.reject("DOWNLOAD_FAILED", e.message, e)
            } finally {
                connection?.disconnect()
            }
        }
    }

    /**
     * Writes base64 bytes to a new cache file and resolves its `file://` URI.
     *
     * The web prepares some files in memory (a resized image, for example) but the transfer module
     * reads from a URI, so the bytes need a home first. Each call gets its own file — the UUID
     * prefix keeps two files with the same name apart — under `cacheDir/transfer-temp/`, where the
     * system may reclaim it; the caller removes it with `unlink` once the transfer is done.
     */
    @ReactMethod
    fun writeTempFile(base64: String, fileName: String?, promise: Promise) {
        thread {
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val dir = File(reactApplicationContext.cacheDir, UploadSources.TEMP_FOLDER)
                if (!dir.isDirectory && !dir.mkdirs()) throw IllegalStateException("cannot create the temp directory")
                val file = File(dir, "${UUID.randomUUID()}-${TempFileName.safe(fileName)}")
                FileOutputStream(file).use { it.write(bytes) }
                promise.resolve(Uri.fromFile(file).toString())
            } catch (e: IllegalArgumentException) {
                promise.reject("WRITE_TEMP_FILE_FAILED", "the data is not valid base64", e)
            } catch (e: Exception) {
                promise.reject("WRITE_TEMP_FILE_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun createDummyFile(path: String, sizeInBytes: Double, promise: Promise) {
        try {
            val cleanPath = getCleanPath(path)
            val file = File(cleanPath)
            if (file.exists()) {
                file.delete()
            }
            file.parentFile?.mkdirs()
            RandomAccessFile(file, "rw").use { raf ->
                raf.setLength(sizeInBytes.toLong())
            }
            promise.resolve(file.absolutePath)
        } catch (e: Exception) {
            promise.reject("CREATE_DUMMY_FILE_FAILED", e.message, e)
        }
    }
}
