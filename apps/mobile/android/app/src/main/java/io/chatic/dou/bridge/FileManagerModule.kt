package io.chatic.dou.bridge

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.RandomAccessFile

class FileManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "FileManager"
    }

    override fun getConstants(): Map<String, Any>? {
        return mapOf(
            "DocumentDirectoryPath" to reactApplicationContext.filesDir.absolutePath
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
                    val success = file.delete()
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
    fun startBackgroundTask(uploadId: String, fileName: String, progress: Double, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, UploadBackgroundService::class.java).apply {
                action = UploadBackgroundService.ACTION_START_OR_UPDATE
                putExtra("uploadId", uploadId)
                putExtra("fileName", fileName)
                putExtra("progress", progress)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("START_BG_TASK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun endBackgroundTask(uploadId: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, UploadBackgroundService::class.java).apply {
                action = UploadBackgroundService.ACTION_STOP
                putExtra("uploadId", uploadId)
            }
            reactApplicationContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("END_BG_TASK_FAILED", e.message, e)
        }
    }
}
