package io.chatic.dou.bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Base64
import androidx.core.app.NotificationCompat
import java.io.BufferedOutputStream
import java.io.FileInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

class UploadBackgroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private val CHANNEL_ID = "upload_channel"
    private val NOTIFICATION_ID = 1001

    // Tracks concurrent active uploads: uploadId -> Pair(fileName, progress)
    private val activeUploads = HashMap<String, Pair<String, Double>>()

    companion object {
        const val ACTION_START_OR_UPDATE = "io.chatic.dou.action.START_OR_UPDATE"
        const val ACTION_STOP = "io.chatic.dou.action.STOP"

        // Native upload engine actions (UploadManagerModule -> Service)
        const val ACTION_ENQUEUE_UPLOAD = "io.chatic.dou.action.UPLOAD.ENQUEUE"
        const val ACTION_PAUSE_UPLOAD = "io.chatic.dou.action.UPLOAD.PAUSE"
        const val ACTION_RESUME_UPLOAD = "io.chatic.dou.action.UPLOAD.RESUME"
        const val ACTION_CANCEL_UPLOAD = "io.chatic.dou.action.UPLOAD.CANCEL"

        // Broadcast event action (Service -> JS module)
        const val ACTION_UPLOAD_EVENT = "io.chatic.dou.action.UPLOAD.EVENT"
    }

    private data class UploadPayload(
        val uploadId: String,
        val fileUri: String,
        val fileName: String,
        val fileSize: Long,
        val mimeType: String,
        val uploadUrl: String,
        val chunkSize: Int,
        val headers: Map<String, String>,
        val initialUploadedBytes: Long,
        val initialLastChunkIndex: Int
    )

    private class UploadTaskState(val payload: UploadPayload) {
        @Volatile var status: String = "queued"
        @Volatile var uploadedBytes: Long = 0L
        @Volatile var lastChunkIndex: Int = 0
        @Volatile var cancelled: Boolean = false
        @Volatile var retryAttempt: Int = 0

        private val pauseLock = Object()
        @Volatile var paused: Boolean = false

        fun pause() {
            paused = true
            status = "paused"
        }

        fun resume() {
            synchronized(pauseLock) {
                paused = false
                status = "uploading"
                pauseLock.notifyAll()
            }
        }

        fun waitIfPausedOrCancelled() {
            if (cancelled) return
            if (!paused) return
            synchronized(pauseLock) {
                while (paused && !cancelled) {
                    pauseLock.wait(250)
                }
            }
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // If the system removes this task while uploads are running, try to keep the service alive as long as possible.
        // Manual recovery is handled in JS via persisted task state; this is best-effort only.
        super.onTaskRemoved(rootIntent)
    }

    private val executor = Executors.newFixedThreadPool(3)
    private val tasks = ConcurrentHashMap<String, UploadTaskState>()
    private val futures = ConcurrentHashMap<String, Future<*>>()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        when (action) {
            ACTION_START_OR_UPDATE -> {
                val uploadId = intent.getStringExtra("uploadId") ?: ""
                val fileName = intent.getStringExtra("fileName") ?: "파일"
                val progress = intent.getDoubleExtra("progress", 0.0)

                if (uploadId.isNotEmpty()) {
                    activeUploads[uploadId] = Pair(fileName, progress)
                }

                val notification = buildNotification()
                startForeground(NOTIFICATION_ID, notification)
            }
            ACTION_STOP -> {
                val uploadId = intent.getStringExtra("uploadId") ?: ""
                if (uploadId.isNotEmpty()) {
                    activeUploads.remove(uploadId)
                }

                if (activeUploads.isEmpty()) {
                    stopForeground(true)
                    stopSelf()
                } else {
                    val notification = buildNotification()
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
            ACTION_ENQUEUE_UPLOAD -> {
                val payload = parseUploadPayload(intent)
                if (payload != null) {
                    enqueueUpload(payload)
                }
            }
            ACTION_PAUSE_UPLOAD -> {
                val uploadId = intent.getStringExtra("uploadId") ?: ""
                pauseUpload(uploadId)
            }
            ACTION_RESUME_UPLOAD -> {
                val uploadId = intent.getStringExtra("uploadId") ?: ""
                resumeUpload(uploadId)
            }
            ACTION_CANCEL_UPLOAD -> {
                val uploadId = intent.getStringExtra("uploadId") ?: ""
                cancelUpload(uploadId)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        try {
            executor.shutdown()
            executor.awaitTermination(200, TimeUnit.MILLISECONDS)
        } catch (_: Exception) {
        }
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "파일 업로드"
            val descriptionText = "백그라운드 파일 업로드 상태를 표시합니다."
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val size = activeUploads.size
        val title = "파일 업로드 중"
        val contentText: String
        val progressPercent: Int

        if (size == 1) {
            val single = activeUploads.values.first()
            progressPercent = (single.second * 100).toInt().coerceIn(0, 100)
            contentText = "${single.first} (${progressPercent}%)"
        } else if (size > 1) {
            val avgProgress = activeUploads.values.map { it.second }.average()
            progressPercent = (avgProgress * 100).toInt().coerceIn(0, 100)
            contentText = "${size}개 파일 업로드 중... (평균 ${progressPercent}%)"
        } else {
            progressPercent = 0
            contentText = "준비 중..."
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setProgress(100, progressPercent, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Chatic:UploadWakeLock").apply {
                acquire(30 * 60 * 1000L) // 30 minutes timeout
            }
        }
    }

    private fun parseUploadPayload(intent: Intent): UploadPayload? {
        val uploadId = intent.getStringExtra("uploadId") ?: ""
        val fileUri = intent.getStringExtra("fileUri") ?: ""
        val fileName = intent.getStringExtra("fileName") ?: "file"
        val fileSize = intent.getLongExtra("fileSize", -1L)
        val mimeType = intent.getStringExtra("mimeType") ?: "application/octet-stream"
        val uploadUrl = intent.getStringExtra("uploadUrl") ?: ""
        val chunkSize = intent.getIntExtra("chunkSize", 1024 * 1024)
        val initialUploadedBytes = intent.getLongExtra("uploadedBytes", 0L)
        val initialLastChunkIndex = intent.getIntExtra("lastChunkIndex", 0)

        if (uploadId.isEmpty() || fileUri.isEmpty() || uploadUrl.isEmpty() || fileSize <= 0) return null

        @Suppress("UNCHECKED_CAST")
        val headers = (intent.getSerializableExtra("headers") as? HashMap<String, String>) ?: hashMapOf()

        return UploadPayload(
            uploadId,
            fileUri,
            fileName,
            fileSize,
            mimeType,
            uploadUrl,
            chunkSize,
            headers,
            initialUploadedBytes,
            initialLastChunkIndex
        )
    }

    private fun enqueueUpload(payload: UploadPayload) {
        val uploadId = payload.uploadId
        val state = tasks.computeIfAbsent(uploadId) { UploadTaskState(payload) }
        state.status = "uploading"
        state.cancelled = false
        state.paused = false
        state.retryAttempt = 0
        if (state.uploadedBytes == 0L && payload.initialUploadedBytes > 0) {
            state.uploadedBytes = payload.initialUploadedBytes
        }
        if (state.lastChunkIndex == 0 && payload.initialLastChunkIndex > 0) {
            state.lastChunkIndex = payload.initialLastChunkIndex
        }

        // Start/update foreground notification entry
        val progress = if (payload.fileSize > 0) state.uploadedBytes.toDouble() / payload.fileSize.toDouble() else 0.0
        activeUploads[uploadId] = Pair(payload.fileName, progress)
        startForeground(NOTIFICATION_ID, buildNotification())
        sendEvent(state, null)

        if (futures.containsKey(uploadId)) return

        futures[uploadId] = executor.submit { runUploadLoop(state) }
    }

    private fun pauseUpload(uploadId: String) {
        val state = tasks[uploadId] ?: return
        state.pause()
        sendEvent(state, null)
    }

    private fun resumeUpload(uploadId: String) {
        val state = tasks[uploadId] ?: return
        state.resume()
        sendEvent(state, null)
    }

    private fun cancelUpload(uploadId: String) {
        val state = tasks[uploadId] ?: return
        state.cancelled = true
        state.status = "cancelled"

        futures.remove(uploadId)?.cancel(true)
        tasks.remove(uploadId)
        activeUploads.remove(uploadId)

        sendEvent(state, null)

        if (activeUploads.isEmpty()) {
            stopForeground(true)
            stopSelf()
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun runUploadLoop(state: UploadTaskState) {
        val payload = state.payload
        val totalBytes = payload.fileSize
        val chunkSize = payload.chunkSize.toLong()
        val totalChunks = ((totalBytes + chunkSize - 1) / chunkSize).toInt()

        try {
            val uri = Uri.parse(payload.fileUri)

            for (i in state.lastChunkIndex until totalChunks) {
                if (state.cancelled) return
                state.waitIfPausedOrCancelled()
                if (state.cancelled || state.paused) return

                val offset = i.toLong() * chunkSize
                val length = minOf(chunkSize, totalBytes - offset).toInt()

                val base64Data = readChunkBase64(uri, offset, length)

                // Legacy-compatible transport: POST JSON with base64 chunkData
                postChunkJsonWithRetry(state, i, totalChunks, offset, length, totalBytes, base64Data)

                state.lastChunkIndex = i + 1
                state.uploadedBytes = minOf(totalBytes, state.uploadedBytes + length.toLong())

                val progress = if (totalBytes > 0) state.uploadedBytes.toDouble() / totalBytes.toDouble() else 0.0
                activeUploads[payload.uploadId] = Pair(payload.fileName, progress)
                startForeground(NOTIFICATION_ID, buildNotification())
                sendEvent(state, null)
            }

            state.status = "completed"
            activeUploads.remove(payload.uploadId)
            sendEvent(state, null)
            startForeground(NOTIFICATION_ID, buildNotification())
        } catch (e: Exception) {
            state.status = "failed"
            sendEvent(state, e.message ?: "upload failed")
        } finally {
            futures.remove(payload.uploadId)
            if (activeUploads.isEmpty()) {
                stopForeground(true)
                stopSelf()
            }
        }
    }

    private fun readChunkBase64(uri: Uri, offset: Long, length: Int): String {
        if (length <= 0) return ""

        val bytes = ByteArray(length)
        val bytesRead: Int = if (uri.scheme == "content") {
            // Prefer seekable file descriptor path for performance; fallback to InputStream skip when not supported.
            try {
                val pfd = applicationContext.contentResolver.openFileDescriptor(uri, "r")
                    ?: throw Exception("Failed to open file descriptor for content URI: $uri")
                try {
                    FileInputStream(pfd.fileDescriptor).use { fis ->
                        val channel = fis.channel
                        channel.position(offset)
                        fis.read(bytes)
                    }
                } finally {
                    try { pfd.close() } catch (_: Exception) {}
                }
            } catch (_: Exception) {
                applicationContext.contentResolver.openInputStream(uri)?.use { stream ->
                    skipFully(stream, offset)
                    readFully(stream, bytes)
                } ?: throw Exception("Failed to open input stream for content URI: $uri")
            }
        } else {
            val cleanPath = cleanFilePath(uri.toString())
            java.io.RandomAccessFile(cleanPath, "r").use { raf ->
                raf.seek(offset)
                raf.read(bytes)
            }
        }

        if (bytesRead <= 0) return ""
        val actual = if (bytesRead < length) bytes.copyOf(bytesRead) else bytes
        return Base64.encodeToString(actual, Base64.NO_WRAP)
    }

    private fun skipFully(stream: InputStream, offset: Long) {
        var remaining = offset
        while (remaining > 0) {
            val skipped = stream.skip(remaining)
            if (skipped <= 0) break
            remaining -= skipped
        }
    }

    private fun readFully(stream: InputStream, buffer: ByteArray): Int {
        var total = 0
        while (total < buffer.size) {
            val read = stream.read(buffer, total, buffer.size - total)
            if (read <= 0) break
            total += read
        }
        return total
    }

    private fun cleanFilePath(path: String): String {
        var clean = path
        if (clean.startsWith("file://")) {
            clean = clean.substring(7)
        }
        return Uri.decode(clean)
    }

    /**
     * POST one chunk using the current "legacy JSON+base64" server contract.
     *
     * Retry policy:
     * - Retries only on network errors and HTTP 5xx.
     * - Uses exponential backoff (base 500ms) with a hard max delay.
     * - Max attempts: 3 (1 initial try + 2 retries)
     *
     * This is best-effort and does not replace manual recovery; when all retries fail we emit a `failed` event.
     */
    private fun postChunkJsonWithRetry(
        state: UploadTaskState,
        chunkIndex: Int,
        totalChunks: Int,
        offset: Long,
        length: Int,
        totalBytes: Long,
        base64Data: String
    ) {
        val maxAttempts = 3
        var attempt = 1
        var lastError: Exception? = null

        while (attempt <= maxAttempts) {
            if (state.cancelled) return
            state.waitIfPausedOrCancelled()
            if (state.cancelled || state.paused) return

            try {
                state.retryAttempt = attempt - 1
                postChunkJson(state.payload, chunkIndex, totalChunks, offset, length, totalBytes, base64Data)
                state.retryAttempt = 0
                return
            } catch (e: Exception) {
                lastError = e
                if (!isRetryableException(e)) break

                if (attempt >= maxAttempts) break

                val delayMs = computeBackoffMs(attempt)
                sendEvent(state, "retrying chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt + 1}/$maxAttempts): ${e.message}")
                try {
                    Thread.sleep(delayMs)
                } catch (_: InterruptedException) {
                    break
                }
            }

            attempt += 1
        }

        throw lastError ?: Exception("upload failed")
    }

    private fun computeBackoffMs(attempt: Int): Long {
        // attempt: 1 -> 500ms, 2 -> 1000ms, 3 -> 2000ms
        val base = 500L
        val delay = base * (1L shl (attempt - 1))
        return minOf(delay, 5_000L)
    }

    private fun isRetryableException(e: Exception): Boolean {
        // We treat server 5xx and generic IO/network exceptions as retryable.
        // Non-retryable (4xx) are thrown from postChunkJson via explicit status check.
        return e.message?.contains("Server returned status 5") == true ||
            e is java.io.IOException
    }

    private fun postChunkJson(
        payload: UploadPayload,
        chunkIndex: Int,
        totalChunks: Int,
        offset: Long,
        length: Int,
        totalBytes: Long,
        base64Data: String
    ) {
        val conn = (URL(payload.uploadUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 30_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Upload-ID", payload.uploadId)
            setRequestProperty("X-Chunk-Index", chunkIndex.toString())
            setRequestProperty("X-Total-Chunks", totalChunks.toString())
            setRequestProperty("X-Chunk-Offset", offset.toString())
            setRequestProperty("X-Chunk-Size", length.toString())
            setRequestProperty("X-File-Name", Uri.encode(payload.fileName))
            setRequestProperty("X-File-Size", totalBytes.toString())
            payload.headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }

        val body =
            """{"uploadId":"${payload.uploadId}","fileName":"${escapeJson(payload.fileName)}","mimeType":"${escapeJson(payload.mimeType)}","chunkIndex":${chunkIndex},"totalChunks":${totalChunks},"offset":${offset},"length":${length},"totalBytes":${totalBytes},"chunkData":"${base64Data}"}"""

        conn.outputStream.use { os ->
            BufferedOutputStream(os).use { bos ->
                bos.write(body.toByteArray(Charsets.UTF_8))
                bos.flush()
            }
        }

        val code = conn.responseCode
        if (code !in 200..299) {
            val err = conn.errorStream?.use(InputStream::readBytes)?.toString(Charsets.UTF_8) ?: ""
            // 5xx is considered retryable by caller; 4xx should immediately fail.
            throw Exception("Server returned status $code: $err")
        }
        conn.inputStream.close()
        conn.disconnect()
    }

    private fun escapeJson(s: String): String {
        return s
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    }

    private fun sendEvent(state: UploadTaskState, errorMessage: String?) {
        val payload = state.payload
        val totalBytes = payload.fileSize
        val progress = if (totalBytes > 0) state.uploadedBytes.toDouble() / totalBytes.toDouble() else 0.0

        val eventIntent = Intent(ACTION_UPLOAD_EVENT).apply {
            setPackage(packageName)
            putExtra("uploadId", payload.uploadId)
            putExtra("status", state.status)
            putExtra("uploadedBytes", state.uploadedBytes)
            putExtra("totalBytes", totalBytes)
            putExtra("progress", progress)
            putExtra("fileName", payload.fileName)
            putExtra("lastChunkIndex", state.lastChunkIndex)
            putExtra("retryAttempt", state.retryAttempt)
            if (errorMessage != null) putExtra("errorMessage", errorMessage)
        }
        sendBroadcast(eventIntent)
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        wakeLock = null
    }
}
