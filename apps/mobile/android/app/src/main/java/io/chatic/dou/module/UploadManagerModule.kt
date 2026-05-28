package io.chatic.dou.bridge

import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * UploadManagerModule (Scaffolding)
 *
 * Goal:
 * - Provide a stable native entrypoint for "native upload engine" migration.
 * - Keep API shape aligned with JS-side `RequestFileUploadPayload`.
 *
 * Current behavior:
 * - Stores minimal in-memory task state.
 * - Updates Android foreground notification via UploadBackgroundService.
 * - Emits basic state events to JS (`UploadManagerStateChanged`) for future integration.
 *
 * Not implemented yet (by design):
 * - Real network upload (OkHttp), chunking, resume, persistence.
 */
class UploadManagerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UploadManager"

    // Required no-op methods for RN event emitter compliance.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private val eventReceiver: BroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            if (intent.action != UploadBackgroundService.ACTION_UPLOAD_EVENT) return

            val uploadId = intent.getStringExtra("uploadId") ?: return
            val status = intent.getStringExtra("status") ?: "uploading"
            val progress = intent.getDoubleExtra("progress", 0.0)
            val uploadedBytes = intent.getLongExtra("uploadedBytes", 0L)
            val totalBytes = intent.getLongExtra("totalBytes", 0L)
            val fileName = intent.getStringExtra("fileName") ?: ""
            val lastChunkIndex = intent.getIntExtra("lastChunkIndex", 0)
            val retryAttempt = intent.getIntExtra("retryAttempt", 0)
            val errorMessage = intent.getStringExtra("errorMessage")

            emitState(uploadId, status, progress, uploadedBytes, totalBytes, fileName, lastChunkIndex, retryAttempt, errorMessage)
        }
    }

    override fun initialize() {
        super.initialize()
        val filter = IntentFilter(UploadBackgroundService.ACTION_UPLOAD_EVENT)
        if (Build.VERSION.SDK_INT >= 33) {
            reactContext.registerReceiver(eventReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            reactContext.registerReceiver(eventReceiver, filter)
        }
    }

    override fun invalidate() {
        try {
            reactContext.unregisterReceiver(eventReceiver)
        } catch (_: Exception) {
        }
        super.invalidate()
    }

    private fun emitState(
        uploadId: String,
        status: String,
        progress: Double,
        uploadedBytes: Long,
        totalBytes: Long,
        fileName: String,
        lastChunkIndex: Int,
        retryAttempt: Int,
        errorMessage: String?
    ) {
        try {
            val params = Arguments.createMap().apply {
                putString("uploadId", uploadId)
                putString("status", status)
                putDouble("progress", progress)
                putDouble("uploadedBytes", uploadedBytes.toDouble())
                putDouble("totalBytes", totalBytes.toDouble())
                if (fileName.isNotEmpty()) putString("fileName", fileName)
                putInt("lastChunkIndex", lastChunkIndex)
                putInt("retryAttempt", retryAttempt)
                if (errorMessage != null) putString("errorMessage", errorMessage)
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("UploadManagerStateChanged", params)
        } catch (_: Exception) {
            // best-effort only
        }
    }

    @ReactMethod
    fun enqueueUpload(payload: ReadableMap, promise: Promise) {
        try {
            val uploadId = payload.getString("uploadId") ?: ""
            val fileUri = payload.getString("fileUri") ?: ""
            val fileName = payload.getString("fileName") ?: "파일"
            val fileSize = payload.getDouble("fileSize").toLong()
            val mimeType = payload.getString("mimeType") ?: "application/octet-stream"
            val uploadUrl = payload.getString("uploadUrl") ?: ""
            val chunkSize = if (payload.hasKey("chunkSize")) payload.getInt("chunkSize") else 1024 * 1024
            val uploadedBytes = if (payload.hasKey("uploadedBytes")) payload.getDouble("uploadedBytes").toLong() else 0L
            val lastChunkIndex = if (payload.hasKey("lastChunkIndex")) payload.getInt("lastChunkIndex") else 0

            if (uploadId.isEmpty()) {
                promise.reject("INVALID_PAYLOAD", "uploadId is required")
                return
            }
            if (fileUri.isEmpty()) {
                promise.reject("INVALID_PAYLOAD", "fileUri is required")
                return
            }
            if (uploadUrl.isEmpty()) {
                promise.reject("INVALID_PAYLOAD", "uploadUrl is required")
                return
            }

            // Basic sanity check for URI parse
            Uri.parse(fileUri)

            val headers = HashMap<String, String>()
            if (payload.hasKey("headers") && !payload.isNull("headers")) {
                val headersMap = payload.getMap("headers")
                headersMap?.keySetIterator()?.let { iter ->
                    while (iter.hasNextKey()) {
                        val k = iter.nextKey()
                        val v = headersMap.getString(k)
                        if (v != null) headers[k] = v
                    }
                }
            }

            // Delegate actual upload execution to the foreground service.
            val intent = Intent(reactContext, UploadBackgroundService::class.java).apply {
                action = UploadBackgroundService.ACTION_ENQUEUE_UPLOAD
                putExtra("uploadId", uploadId)
                putExtra("fileUri", fileUri)
                putExtra("fileName", fileName)
                putExtra("fileSize", fileSize)
                putExtra("mimeType", mimeType)
                putExtra("uploadUrl", uploadUrl)
                putExtra("chunkSize", chunkSize)
                putExtra("headers", headers)
                putExtra("uploadedBytes", uploadedBytes)
                putExtra("lastChunkIndex", lastChunkIndex)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }

            promise.resolve(
                Arguments.createMap().apply {
                    putString("uploadId", uploadId)
                    putString("status", "uploading")
                    putDouble("fileSize", fileSize.toDouble())
                }
            )
        } catch (e: Exception) {
            promise.reject("ENQUEUE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun pauseUpload(uploadId: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, UploadBackgroundService::class.java).apply {
                action = UploadBackgroundService.ACTION_PAUSE_UPLOAD
                putExtra("uploadId", uploadId)
            }
            reactContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PAUSE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun resumeUpload(uploadId: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, UploadBackgroundService::class.java).apply {
                action = UploadBackgroundService.ACTION_RESUME_UPLOAD
                putExtra("uploadId", uploadId)
            }
            reactContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("RESUME_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun cancelUpload(uploadId: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, UploadBackgroundService::class.java).apply {
                action = UploadBackgroundService.ACTION_CANCEL_UPLOAD
                putExtra("uploadId", uploadId)
            }
            reactContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CANCEL_FAILED", e.message, e)
        }
    }
}
