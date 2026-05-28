package io.chatic.dou.module

import android.content.Intent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.chatic.dou.R
import io.chatic.dou.service.UploadBackgroundService
import io.chatic.dou.worker.UploadWorker

/**
 * UploadManagerModule — JS ↔ Native 업로드 브릿지 모듈
 *
 * 구조:
 * - JS에서 enqueueUpload/pause/resume/cancel 호출 시 UploadBackgroundService로 Intent 전달
 * - enqueueUpload 시 WorkManager를 통해 UploadWorker도 등록 (Foreground Worker 보장)
 * - UploadBackgroundService의 브로드캐스트를 수신하여 JS로 이벤트 전달
 *
 * 이벤트 흐름:
 * JS → enqueueUpload() → WorkManager(UploadWorker) + Service Intent
 * Service → BroadcastReceiver → JS(UploadManagerStateChanged)
 */
class UploadManagerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UploadManager"

    // RN 이벤트 이미터 필수 no-op 메서드
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    /**
     * UploadBackgroundService 브로드캐스트 수신기.
     * Service → JS 방향의 업로드 상태 이벤트를 중계.
     */
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

    /**
     * 새 업로드 태스크 등록.
     *
     * 동작:
     * 1. WorkManager에 UploadWorker 등록 (Foreground Worker + 네트워크 제약)
     * 2. UploadBackgroundService에 ACTION_ENQUEUE_UPLOAD Intent 전달
     *
     * WorkManager uniqueWork 정책: KEEP — 동일 uploadId 중복 시 기존 작업 유지
     */
    @ReactMethod
    fun enqueueUpload(payload: ReadableMap, promise: Promise) {
        try {
            val uploadId = payload.getString("uploadId") ?: ""
            val fileUri = payload.getString("fileUri") ?: ""
            val fileName = payload.getString("fileName") ?: reactContext.getString(R.string.upload_default_file_name)
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

            // 1) WorkManager에 UploadWorker 등록 (Foreground Worker + 네트워크 제약)
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<UploadWorker>()
                .setInputData(workDataOf(UploadWorker.KEY_UPLOAD_ID to uploadId))
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(reactContext).enqueueUniqueWork(
                "upload_$uploadId",
                androidx.work.ExistingWorkPolicy.KEEP,
                workRequest
            )

            // 2) Foreground Service에 업로드 실행 위임
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
            // WorkManager 작업도 함께 취소
            WorkManager.getInstance(reactContext).cancelUniqueWork("upload_$uploadId")

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
