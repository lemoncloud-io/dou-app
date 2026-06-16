package io.chatic.dou.service

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
import android.util.Log
import androidx.core.app.NotificationCompat
import io.chatic.dou.R
import java.io.BufferedOutputStream
import java.io.FileInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

/**
 * UploadBackgroundService — Android Foreground Service 기반 청크 업로드 엔진
 *
 * 구조:
 * - Foreground Service로 실행되어 OS가 프로세스를 종료하지 않도록 방지
 * - WorkManager(UploadWorker)에 의해 생명주기 관리됨
 * - 최대 3개의 업로드를 동시에 처리하는 스레드풀 사용
 * - 청크 포맷: multipart/form-data binary (base64 오버헤드 없음)
 *
 * 이벤트 흐름:
 * Service → BroadcastIntent(ACTION_UPLOAD_EVENT) → UploadManagerModule → JS(RN Event)
 */
class UploadBackgroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private val CHANNEL_ID = "upload_channel"
    private val NOTIFICATION_ID = 1001

    // 현재 활성 업로드 목록: uploadId -> Pair(fileName, progress)
    private val activeUploads = HashMap<String, Pair<String, Double>>()

    companion object {
        const val ACTION_START_OR_UPDATE = "io.chatic.dou.action.START_OR_UPDATE"
        const val ACTION_STOP = "io.chatic.dou.action.STOP"

        // JS → Service 명령 액션
        const val ACTION_ENQUEUE_UPLOAD = "io.chatic.dou.action.UPLOAD.ENQUEUE"
        const val ACTION_PAUSE_UPLOAD = "io.chatic.dou.action.UPLOAD.PAUSE"
        const val ACTION_RESUME_UPLOAD = "io.chatic.dou.action.UPLOAD.RESUME"
        const val ACTION_CANCEL_UPLOAD = "io.chatic.dou.action.UPLOAD.CANCEL"

        // Service → JS 이벤트 브로드캐스트 액션
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
        // 시스템이 태스크를 제거하는 경우 best-effort 처리.
        // JS의 SQLite 기반 복구로 이어받기 가능.
        super.onTaskRemoved(rootIntent)
    }

    // 최대 3개 업로드 동시 처리
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
                startForegroundCompat(notification)
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
                    startForegroundCompat(notification)
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
            val name = getString(R.string.upload_notification_channel_name)
            val descriptionText = getString(R.string.upload_notification_channel_desc)
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
        val title = getString(R.string.upload_notification_title)
        val contentText: String
        val progressPercent: Int

        if (size == 1) {
            val single = activeUploads.values.first()
            progressPercent = (single.second * 100).toInt().coerceIn(0, 100)
            contentText = getString(R.string.upload_notification_single, single.first, progressPercent)
        } else if (size > 1) {
            val avgProgress = activeUploads.values.map { it.second }.average()
            progressPercent = (avgProgress * 100).toInt().coerceIn(0, 100)
            contentText = getString(R.string.upload_notification_multiple, size, progressPercent)
        } else {
            progressPercent = 0
            contentText = getString(R.string.upload_notification_preparing)
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

    /**
     * WakeLock 획득 — Foreground Service가 살아있는 동안 CPU를 유지.
     * 타임아웃 없이 획득하며, onDestroy 시 반드시 해제됨.
     */
    @Suppress("WakelockTimeout")
    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Chatic:UploadWakeLock").apply {
                // 타임아웃 없이 획득 — Foreground Service 종료 시 반드시 releaseWakeLock() 호출됨
                acquire()
            }
        }
    }

    private fun parseUploadPayload(intent: Intent): UploadPayload? {
        val uploadId = intent.getStringExtra("uploadId") ?: ""
        val fileUri = intent.getStringExtra("fileUri") ?: ""
        val fileName = intent.getStringExtra("fileName") ?: getString(R.string.upload_default_file_name)
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

        val progress = if (payload.fileSize > 0) state.uploadedBytes.toDouble() / payload.fileSize.toDouble() else 0.0
        activeUploads[uploadId] = Pair(payload.fileName, progress)
        startForegroundCompat(buildNotification())
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
            startForegroundCompat(buildNotification())
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

                // 청크 바이너리 읽기 (base64 변환 없음)
                val chunkBytes = readChunkBytes(uri, offset, length)

                // multipart/form-data binary 전송
                postChunkMultipartWithRetry(state, i, totalChunks, offset, length, totalBytes, chunkBytes)

                state.lastChunkIndex = i + 1
                state.uploadedBytes = minOf(totalBytes, state.uploadedBytes + length.toLong())

                val progress = if (totalBytes > 0) state.uploadedBytes.toDouble() / totalBytes.toDouble() else 0.0
                activeUploads[payload.uploadId] = Pair(payload.fileName, progress)
                startForegroundCompat(buildNotification())
                sendEvent(state, null)
            }

            state.status = "completed"
            activeUploads.remove(payload.uploadId)
            sendEvent(state, null)
            startForegroundCompat(buildNotification())
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

    /**
     * 파일에서 청크 바이너리를 읽어 ByteArray로 반환.
     * content:// URI는 FileDescriptor 채널 seek, file:// URI는 RandomAccessFile 사용.
     */
    private fun readChunkBytes(uri: Uri, offset: Long, length: Int): ByteArray {
        if (length <= 0) return ByteArray(0)

        val bytes = ByteArray(length)
        if (uri.scheme == "content") {
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
        return bytes
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
     * 청크 multipart/form-data 전송 (재시도 포함).
     *
     * 재시도 정책:
     * - 네트워크 오류 및 HTTP 5xx에서만 재시도
     * - 지수 백오프 (base 500ms, 최대 5초)
     * - 최대 3회 시도 (최초 1회 + 재시도 2회)
     */
    private fun postChunkMultipartWithRetry(
        state: UploadTaskState,
        chunkIndex: Int,
        totalChunks: Int,
        offset: Long,
        length: Int,
        totalBytes: Long,
        chunkBytes: ByteArray
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
                postChunkMultipart(state.payload, chunkIndex, totalChunks, offset, length, totalBytes, chunkBytes)
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
        return e.message?.contains("Server returned status 5") == true ||
            e is java.io.IOException
    }

    /**
     * 청크 하나를 multipart/form-data binary로 POST.
     *
     * 요청 형식:
     * - Content-Type: multipart/form-data; boundary=<UUID>
     * - 메타데이터: HTTP 헤더 (X-Upload-ID, X-Chunk-Index, 등)
     * - 청크 데이터: multipart body의 "file" 파트 (binary, base64 아님)
     */
    private fun postChunkMultipart(
        payload: UploadPayload,
        chunkIndex: Int,
        totalChunks: Int,
        offset: Long,
        length: Int,
        totalBytes: Long,
        chunkBytes: ByteArray
    ) {
        val boundary = "----UploadBoundary${UUID.randomUUID().toString().replace("-", "")}"
        val CRLF = "\r\n"

        val conn = (URL(payload.uploadUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 30_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setRequestProperty("X-Upload-ID", payload.uploadId)
            setRequestProperty("X-Chunk-Index", chunkIndex.toString())
            setRequestProperty("X-Total-Chunks", totalChunks.toString())
            setRequestProperty("X-Chunk-Offset", offset.toString())
            setRequestProperty("X-Chunk-Size", length.toString())
            setRequestProperty("X-File-Name", Uri.encode(payload.fileName))
            setRequestProperty("X-File-Size", totalBytes.toString())
            setRequestProperty("X-Mime-Type", payload.mimeType)
            payload.headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }

        conn.outputStream.use { os ->
            BufferedOutputStream(os).use { bos ->
                // multipart 파트 시작
                val partHeader = "--$boundary$CRLF" +
                    "Content-Disposition: form-data; name=\"file\"; filename=\"chunk_$chunkIndex\"$CRLF" +
                    "Content-Type: application/octet-stream$CRLF" +
                    "$CRLF"
                bos.write(partHeader.toByteArray(Charsets.UTF_8))
                bos.write(chunkBytes)
                // multipart 파트 종료
                val partFooter = "$CRLF--$boundary--$CRLF"
                bos.write(partFooter.toByteArray(Charsets.UTF_8))
                bos.flush()
            }
        }

        val code = conn.responseCode
        if (code !in 200..299) {
            val err = conn.errorStream?.use(InputStream::readBytes)?.toString(Charsets.UTF_8) ?: ""
            throw Exception("Server returned status $code: $err")
        }
        conn.inputStream.close()
        conn.disconnect()
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

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        wakeLock = null
    }
}
