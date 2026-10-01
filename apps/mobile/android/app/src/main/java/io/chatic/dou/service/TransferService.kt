package io.chatic.dou.service

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import io.chatic.dou.transfer.TransferNotifications
import io.chatic.dou.transfer.TransferRegistry
import io.chatic.dou.transfer.core.DownloadFiles
import io.chatic.dou.transfer.core.DownloadedFile
import io.chatic.dou.transfer.core.TransferDirection
import io.chatic.dou.transfer.core.TransferErrorCode
import io.chatic.dou.transfer.core.TransferNotice
import io.chatic.dou.transfer.core.TransferSnapshot
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.MalformedURLException
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import kotlin.concurrent.thread

/**
 * Foreground service (type `dataSync`) that moves the bytes while any transfer is running, and
 * stops itself as soon as none is.
 *
 * It is an executor only. Every decision — what a response means, whether a late report counts,
 * which event goes out — belongs to [TransferRegistry]'s core; the service reports what happened
 * and stops a transport when the registry says the transfer ended. That is also how a cancel from
 * the web, from the notification, or from the OS time limit reaches a running transfer: the service
 * listens for terminal events and tears down the matching connection.
 *
 * A download writes into its own folder under `cache/transfer-download/` and keeps the file only
 * when the server answered 2xx and the registry recorded it; every other ending deletes the folder.
 *
 * No retries here: whether to try again is the app's decision.
 */
class TransferService : Service() {

    companion object {
        private const val TAG = "TransferService"

        private const val ACTION_START = "io.chatic.dou.action.TRANSFER.START"
        private const val ACTION_CANCEL_ALL = "io.chatic.dou.action.TRANSFER.CANCEL_ALL"
        private const val EXTRA_TRANSFER_ID = "transferId"

        private const val MAX_CONCURRENT_TRANSFERS = 3
        private const val COPY_BUFFER_BYTES = 64 * 1024
        private const val MAX_BODY_BYTES = 4 * 1024
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val READ_TIMEOUT_MS = 60_000
        private const val NOTIFICATION_INTERVAL_MS = 200L

        /** Longer than the 6 h data-sync budget, so the lock never outlives a legitimate run. */
        private const val WAKE_LOCK_TIMEOUT_MS = 7L * 60 * 60 * 1000

        /** Last batch a failure summary was posted for; process-wide so a new instance never repeats it. */
        @Volatile
        private var summarisedBatch = -1L

        /**
         * Starts (or feeds) the service for an accepted transfer. Only the id travels in the
         * intent — the URL and headers stay in [TransferRegistry]'s memory, so they never reach
         * the system's copy of the intent.
         */
        fun startTransfer(context: Context, transferId: String) {
            val intent = Intent(context, TransferService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_TRANSFER_ID, transferId)
            ContextCompat.startForegroundService(context, intent)
        }
    }

    /** One running HTTP transfer. */
    private class Job(val spec: TransferRegistry.TransportSpec) {
        @Volatile var connection: HttpURLConnection? = null
        @Volatile var future: Future<*>? = null
        @Volatile var aborted = false

        /** Blocking I/O ignores interrupts; closing the connection is what unblocks the worker. */
        fun abort() {
            aborted = true
            try {
                connection?.disconnect()
            } catch (_: Exception) {
            }
            future?.cancel(true)
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val jobs = ConcurrentHashMap<String, Job>()
    private lateinit var executor: ExecutorService
    private lateinit var notifications: TransferNotifications
    private var wakeLock: PowerManager.WakeLock? = null

    private var lastNotificationAt = 0L
    private var notificationScheduled = false
    private var stopped = false
    private var lastStartId = 0

    private val listener = TransferRegistry.Listener { snapshot -> onTransferState(snapshot) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        executor = Executors.newFixedThreadPool(MAX_CONCURRENT_TRANSFERS)
        notifications = TransferNotifications(this)
        notifications.ensureChannel()
        acquireWakeLock()
        TransferRegistry.addListener(listener)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId
        when (intent?.action) {
            ACTION_START -> {
                // Required within seconds of startForegroundService, even if there turns out to be
                // nothing to run — otherwise the OS kills the app.
                enterForeground()
                stopped = false
                intent.getStringExtra(EXTRA_TRANSFER_ID)?.let { launch(it) }
                if (!TransferRegistry.hasRunning()) finishBatch()
            }
            ACTION_CANCEL_ALL -> {
                val ids = TransferRegistry.cancelAllRunning()
                Log.i(TAG, "notification cancel: ${ids.size} transfer(s)")
                if (!TransferRegistry.hasRunning()) finishBatch()
            }
            else -> if (!TransferRegistry.hasRunning()) finishBatch()
        }
        // Not sticky: after a process death the instructions (held in memory only) are gone, so a
        // restarted service would have nothing it could legitimately run.
        return START_NOT_STICKY
    }

    /** Android 15+: the data-sync budget (6 h per 24 h) ran out. Must stop within a few seconds. */
    override fun onTimeout(startId: Int, fgsType: Int) {
        handleTimeout()
    }

    /** Android 14 signature, only called for the short-service type; handled the same way for safety. */
    override fun onTimeout(startId: Int) {
        handleTimeout()
    }

    override fun onDestroy() {
        TransferRegistry.removeListener(listener)
        // A transfer this instance was still moving has lost its transport; say so instead of
        // leaving it `running`. Only its own jobs: a transfer accepted after the decision to stop
        // belongs to the next instance, which the pending start command is already creating.
        val orphaned = jobs.values.toList()
        orphaned.forEach {
            TransferRegistry.failure(it.spec.transferId, TransferErrorCode.SYSTEM, "the transfer service was stopped")
        }
        abortInBackground(orphaned)
        jobs.clear()
        executor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        releaseWakeLock()
        super.onDestroy()
    }

    // ---- Transfers ------------------------------------------------------------------------------

    private fun launch(transferId: String) {
        val spec = TransferRegistry.takeSpec(transferId) ?: return
        val job = Job(spec)
        jobs[transferId] = job
        job.future = executor.submit { runJob(job) }
    }

    private fun runJob(job: Job) {
        val id = job.spec.transferId
        try {
            if (job.aborted) return
            when (job.spec.direction) {
                TransferDirection.UPLOAD -> runUpload(job)
                TransferDirection.DOWNLOAD -> download(job)
            }
        } catch (e: Exception) {
            if (!job.aborted) TransferRegistry.failure(id, TransferErrorCode.INTERNAL, describe(e))
        } finally {
            job.connection?.disconnect()
            jobs.remove(id)
            // The job may end without an event this service caused (it was already aborted), so the
            // lifecycle is re-checked here as well.
            mainHandler.post { refresh() }
        }
    }

    private fun runUpload(job: Job) {
        val source = try {
            openSource(job.spec.fileUri)
        } catch (e: Exception) {
            TransferRegistry.failure(job.spec.transferId, TransferErrorCode.SOURCE, "cannot open the source: ${describe(e)}")
            return
        }
        try {
            upload(job, source)
        } finally {
            try {
                source.close()
            } catch (_: IOException) {
            }
        }
    }

    /**
     * One streaming PUT. Every exit reports exactly what happened to the registry; whether that
     * report still counts (the transfer may have been cancelled meanwhile) is the core's call.
     */
    private fun upload(job: Job, source: InputStream) {
        val spec = job.spec
        val id = spec.transferId
        val connection = try {
            URL(spec.url).openConnection() as HttpURLConnection
        } catch (_: MalformedURLException) {
            TransferRegistry.failure(id, TransferErrorCode.INVALID, "the url cannot be parsed")
            return
        } catch (_: ClassCastException) {
            TransferRegistry.failure(id, TransferErrorCode.INVALID, "the url is not http or https")
            return
        }
        job.connection = connection
        // A cancel that landed before the connection existed had nothing to disconnect.
        if (job.aborted) return

        connection.requestMethod = "PUT"
        connection.doOutput = true
        connection.useCaches = false
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        // Streams the file instead of buffering it, and writes Content-Length itself — which is why
        // the caller's copy of that header is filtered out.
        connection.setFixedLengthStreamingMode(spec.contentLength)
        spec.headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }

        val output: OutputStream = try {
            connection.outputStream
        } catch (e: IOException) {
            reportNetwork(job, e)
            return
        }

        val buffer = ByteArray(COPY_BUFFER_BYTES)
        var sent = 0L
        while (sent < spec.contentLength) {
            if (job.aborted) return
            val want = minOf(buffer.size.toLong(), spec.contentLength - sent).toInt()
            val read = try {
                source.read(buffer, 0, want)
            } catch (e: IOException) {
                TransferRegistry.failure(id, TransferErrorCode.SOURCE, "cannot read the source: ${describe(e)}")
                return
            }
            if (read < 0) {
                TransferRegistry.failure(id, TransferErrorCode.SOURCE, "the source ended after $sent of ${spec.contentLength} bytes")
                return
            }
            try {
                output.write(buffer, 0, read)
            } catch (e: IOException) {
                reportNetwork(job, e)
                return
            }
            sent += read
            TransferRegistry.progress(id, sent)
        }

        // A source longer than the declared length would otherwise upload a silently truncated file.
        val extra = try {
            source.read()
        } catch (e: IOException) {
            TransferRegistry.failure(id, TransferErrorCode.SOURCE, "cannot read the source: ${describe(e)}")
            return
        }
        if (extra >= 0) {
            TransferRegistry.failure(id, TransferErrorCode.SOURCE, "the source is longer than ${spec.contentLength} bytes")
            return
        }

        val status = try {
            output.close()
            connection.responseCode
        } catch (e: IOException) {
            reportNetwork(job, e)
            return
        }
        if (status < 0) {
            // HttpURLConnection's way of saying the reply was not HTTP at all: no response arrived.
            if (!job.aborted) TransferRegistry.failure(id, TransferErrorCode.NETWORK, "the server reply was not valid HTTP")
            return
        }
        TransferRegistry.response(id, status, readBody(connection))
    }

    /**
     * One streaming GET into `transfer-download/<folder>/<name>.part`, renamed to its final name —
     * with the extension the bytes show — once the body is complete. A status other than 2xx is
     * reported with its `<Code>` and writes nothing: an S3 error document must never land under an
     * image's name.
     */
    private fun download(job: Job) {
        val spec = job.spec
        val id = spec.transferId
        val parts = spec.nameParts ?: DownloadFiles.nameParts(null)
        val root = File(cacheDir, DownloadFiles.FOLDER)
        val folder = File(root, DownloadFiles.folderName(id))
        var kept = false
        try {
            // A reused id starts from an empty folder, the way the iOS shell starts it: whatever an
            // earlier, acknowledged download left under the same id is not this one's.
            folder.deleteRecursively()
            sweepDownloads(root)
            val connection = try {
                URL(spec.url).openConnection() as HttpURLConnection
            } catch (_: MalformedURLException) {
                TransferRegistry.failure(id, TransferErrorCode.INVALID, "the url cannot be parsed")
                return
            } catch (_: ClassCastException) {
                TransferRegistry.failure(id, TransferErrorCode.INVALID, "the url is not http or https")
                return
            }
            job.connection = connection
            if (job.aborted) return

            connection.requestMethod = "GET"
            connection.useCaches = false
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            // Includes `Accept-Encoding: identity`: set by hand, it also stops the stack from
            // inflating a compressed reply, so the bytes kept are the stored object's.
            spec.headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }

            val status = try {
                connection.responseCode
            } catch (e: IOException) {
                reportNetwork(job, e)
                return
            }
            if (status < 0) {
                if (!job.aborted) TransferRegistry.failure(id, TransferErrorCode.NETWORK, "the server reply was not valid HTTP")
                return
            }
            if (!DownloadFiles.keepsBody(status)) {
                TransferRegistry.response(id, status, readBody(connection))
                return
            }
            TransferRegistry.expectLength(id, connection.contentLengthLong)

            if (!folder.isDirectory && !folder.mkdirs()) {
                TransferRegistry.failure(id, TransferErrorCode.SOURCE, "cannot create the download folder")
                return
            }
            val part = File(folder, DownloadFiles.partName(parts))
            if (!receive(job, connection, part)) return

            val target = File(folder, DownloadFiles.fileName(parts, DownloadFiles.sniffImage(readHead(part))))
            if (!part.renameTo(target)) {
                TransferRegistry.failure(id, TransferErrorCode.SOURCE, "cannot commit the downloaded file")
                return
            }
            val file = DownloadedFile(Uri.fromFile(target).toString(), target.length(), connection.contentType)
            kept = TransferRegistry.response(id, status, null, file)
        } finally {
            // Anything but a committed, recorded file leaves nothing behind: a failed or cancelled
            // `.part`, or a file whose transfer was cancelled while it was being committed.
            if (!kept) folder.deleteRecursively()
        }
    }

    /** Streams the body into [part]. Returns false once it has reported how it failed (or was aborted). */
    private fun receive(job: Job, connection: HttpURLConnection, part: File): Boolean {
        val id = job.spec.transferId
        val input = try {
            connection.inputStream
        } catch (e: IOException) {
            reportNetwork(job, e)
            return false
        }
        input.use {
            val output = try {
                FileOutputStream(part)
            } catch (e: IOException) {
                TransferRegistry.failure(id, TransferErrorCode.SOURCE, "cannot create the file: ${describe(e)}")
                return false
            }
            output.use {
                val buffer = ByteArray(COPY_BUFFER_BYTES)
                var received = 0L
                while (true) {
                    if (job.aborted) return false
                    val read = try {
                        input.read(buffer)
                    } catch (e: IOException) {
                        reportNetwork(job, e)
                        return false
                    }
                    if (read < 0) break
                    try {
                        output.write(buffer, 0, read)
                    } catch (e: IOException) {
                        // On the download side SOURCE means the local file could not be written.
                        if (!job.aborted) TransferRegistry.failure(id, TransferErrorCode.SOURCE, "cannot write the file: ${describe(e)}")
                        return false
                    }
                    received += read
                    TransferRegistry.progress(id, received)
                }
                val expected = connection.contentLengthLong
                if (expected > 0 && received != expected) {
                    if (!job.aborted) TransferRegistry.failure(id, TransferErrorCode.NETWORK, "the body ended after $received of $expected bytes")
                    return false
                }
            }
        }
        return true
    }

    /** The first bytes of [file], enough to tell an image type from. */
    private fun readHead(file: File): ByteArray =
        try {
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
        } catch (_: IOException) {
            ByteArray(0)
        }

    /**
     * Deletes transfer folders last changed more than a day ago, except those of running downloads.
     * A shared file is kept after the share sheet closes — the receiving app may read it late — so
     * this is what eventually clears it. Best effort: the OS may clear the cache as well.
     */
    private fun sweepDownloads(root: File) {
        val children = root.listFiles() ?: return
        val running = TransferRegistry.runningDownloads().mapTo(HashSet()) { DownloadFiles.folderName(it) }
        val folders = children.filter { it.isDirectory }.map { DownloadFiles.FolderAge(it.name, it.lastModified()) }
        DownloadFiles.foldersToSweep(folders, System.currentTimeMillis(), running).forEach {
            File(root, it).deleteRecursively()
        }
    }

    private fun reportNetwork(job: Job, e: IOException) {
        // After an abort the IOException is our own disconnect, not a network fault.
        if (job.aborted) return
        TransferRegistry.failure(job.spec.transferId, TransferErrorCode.NETWORK, describe(e))
    }

    /** Up to [MAX_BODY_BYTES] of the response body, for the storage error code. Best effort. */
    private fun readBody(connection: HttpURLConnection): String? =
        try {
            (connection.errorStream ?: connection.inputStream)?.use { stream ->
                val bytes = ByteArray(MAX_BODY_BYTES)
                var total = 0
                while (total < bytes.size) {
                    val read = stream.read(bytes, total, bytes.size - total)
                    if (read < 0) break
                    total += read
                }
                String(bytes, 0, total, Charsets.UTF_8)
            }
        } catch (_: IOException) {
            null
        }

    /** `content://` and `file://` go through the resolver; a bare path is treated as a file. */
    private fun openSource(fileUri: String): InputStream {
        val parsed = Uri.parse(fileUri)
        val uri = if (parsed.scheme.isNullOrEmpty()) Uri.fromFile(File(fileUri)) else parsed
        return contentResolver.openInputStream(uri) ?: throw FileNotFoundException("the resolver returned no stream")
    }

    /** An exception as a short diagnostic; the core strips any URL it quotes. */
    private fun describe(e: Exception): String = "${e.javaClass.simpleName}: ${e.message.orEmpty()}"

    // ---- Registry events (delivered on the registry's event thread) ----------------------------

    private fun onTransferState(snapshot: TransferSnapshot) {
        if (snapshot.state.isTerminal) {
            // Covers cancel (web or notification) and the OS time limit. For a transfer this service
            // finished itself the job is already unwinding and the abort is harmless. The disconnect
            // runs on its own thread so neither the main thread nor event delivery waits on a socket.
            jobs[snapshot.transferId]?.let { abortInBackground(listOf(it)) }
        }
        mainHandler.post { refresh() }
    }

    // ---- Notification and lifecycle (main thread) -----------------------------------------------

    private fun refresh() {
        if (stopped) return
        if (!TransferRegistry.hasRunning()) {
            finishBatch()
            return
        }
        if (notificationScheduled) return
        val wait = lastNotificationAt + NOTIFICATION_INTERVAL_MS - SystemClock.elapsedRealtime()
        if (wait <= 0) {
            postProgressNotification()
        } else {
            notificationScheduled = true
            mainHandler.postDelayed({
                notificationScheduled = false
                if (!stopped && TransferRegistry.hasRunning()) postProgressNotification()
            }, wait)
        }
    }

    private fun postProgressNotification() {
        lastNotificationAt = SystemClock.elapsedRealtime()
        notifications.update(buildProgressNotification())
    }

    private fun buildProgressNotification() =
        notifications.progress(TransferNotice.progress(TransferRegistry.batchStatus()), cancelAllIntent())

    private fun enterForeground() {
        val notification = buildProgressNotification()
        lastNotificationAt = SystemClock.elapsedRealtime()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
        ServiceCompat.startForeground(this, TransferNotifications.PROGRESS_NOTIFICATION_ID, notification, type)
    }

    /**
     * Nothing is running: drop the progress notification, leave a summary if anything failed, and
     * stop. `stopSelfResult` with the latest start id keeps the service alive when a new transfer
     * was requested in the meantime — its start command is already on the way.
     */
    private fun finishBatch() {
        val status = TransferRegistry.batchStatus()
        TransferNotice.failureSummary(status)?.let { notice ->
            if (status.sequence != summarisedBatch) {
                summarisedBatch = status.sequence
                notifications.postFailureSummary(notice)
            }
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopped = true
        stopSelfResult(lastStartId)
    }

    /**
     * The OS ended the data-sync budget. Everything running fails with `SYSTEM` (the results stay in
     * the registry for the web to read), and the service stops unconditionally: not stopping
     * within a few seconds crashes the app.
     */
    private fun handleTimeout() {
        Log.w(TAG, "data sync time limit reached")
        TransferRegistry.failAllRunning(TransferErrorCode.SYSTEM, "the system time limit for background transfers was reached")
        abortInBackground(jobs.values.toList())
        finishBatch()
        stopSelf()
    }

    private fun abortInBackground(toAbort: List<Job>) {
        if (toAbort.isEmpty()) return
        thread(name = "transfer-abort", isDaemon = true) { toAbort.forEach { it.abort() } }
    }

    private fun cancelAllIntent(): PendingIntent {
        val intent = Intent(this, TransferService::class.java).setAction(ACTION_CANCEL_ALL)
        return PendingIntent.getService(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun acquireWakeLock() {
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Chatic:TransferWakeLock").apply {
            setReferenceCounted(false)
            acquire(WAKE_LOCK_TIMEOUT_MS)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }
}
