package io.chatic.dou.transfer.core

/**
 * The decision-making half of the native transfer module: validation, state transitions, the
 * progress throttle, retention and acknowledgement, and the batch aggregate the notification shows.
 *
 * The core never touches the network, a thread or the OS. The OS layer feeds it what happened
 * (bytes moved, a response arrived, the connection broke, the user cancelled) and carries out what
 * it returns: every mutating call returns the event (or events, in order) to emit, and null or an
 * empty list means "emit nothing". It is not thread-safe; the owner calls it under one lock.
 *
 * @param clock milliseconds from any monotonic origin; injected so tests control time.
 * @param log receives diagnostic lines. They hold transfer ids only, never a URL.
 */
class TransferCore(
    private val clock: () -> Long,
    private val log: (String) -> Unit = {},
) {

    companion object {
        /** A `running` event goes out at most this often per transfer. */
        const val PROGRESS_INTERVAL_MS = 200L

        /** Terminal results kept for a caller that has not acknowledged them yet. */
        const val RETENTION_CAP = 100

        /** No byte progress for this long means the continued-processing task should close. */
        const val STALL_TIMEOUT_MS = 30_000L
    }

    private class Entry(
        val transferId: String,
        val direction: TransferDirection,
        /** Known at start for an upload; a download learns it from the response ([expectLength]). */
        var totalBytes: Long,
        val title: String?,
    ) {
        var state: TransferState = TransferState.RUNNING
        var transferredBytes: Long = 0
        var httpStatus: Int? = null
        var providerCode: String? = null
        var errorCode: TransferErrorCode? = null
        var errorMessage: String? = null
        var file: DownloadedFile? = null
        var lastEmittedAt: Long = 0
        var lastProgressAt: Long? = null

        /** Order in which the entry became terminal; decides which one the retention cap drops. */
        var terminalSequence: Long = 0

        fun snapshot() = TransferSnapshot(
            transferId = transferId,
            direction = direction,
            state = state,
            transferredBytes = transferredBytes,
            totalBytes = totalBytes,
            httpStatus = httpStatus,
            providerCode = providerCode,
            errorCode = errorCode,
            errorMessage = errorMessage,
            file = file,
        )
    }

    /** Insertion order is start order, which is the order `list` promises. */
    private val entries = LinkedHashMap<String, Entry>()
    private var nextTerminalSequence = 0L

    /**
     * Members of the current batch. Held separately from [entries] because an acknowledged member
     * still counts toward the batch aggregate: the web may ack a finished file while its siblings
     * are still moving, and the notification must not jump backwards when it does.
     */
    private val batch = mutableListOf<Entry>()
    private var batchStartedAt = 0L
    private var batchSequence = 0L

    // ---- Commands -------------------------------------------------------------------------------

    /**
     * Registers a transfer and returns its first `running` event, which goes out immediately.
     *
     * @throws TransferRejectedException with [TransferErrorCode.INVALID] for a request the shell
     *   cannot run.
     */
    fun start(request: TransferRequest): TransferSnapshot {
        val transferId = request.transferId?.takeIf { it.isNotBlank() }
            ?: throw invalid("transferId is required")
        if (entries.containsKey(transferId)) throw invalid("transferId is already in use")
        val direction = TransferDirection.fromWire(request.direction)
            ?: throw invalid("direction must be upload or download")
        val totalBytes = when (direction) {
            TransferDirection.UPLOAD -> {
                if (request.method != "PUT") throw invalid("upload requires method PUT")
                if (!TransferRules.isTransferUrl(request.url)) throw invalid("url must be an absolute http or https URL")
                if (request.fileUri.isNullOrBlank()) throw invalid("file.uri is required")
                val length = request.contentLength
                if (length == null || !length.isFinite() || length < 0 || length != Math.floor(length)) {
                    throw invalid("upload requires a whole, non-negative file.contentLength")
                }
                length.toLong()
            }
            TransferDirection.DOWNLOAD -> {
                if (request.method != "GET") throw invalid("download requires method GET")
                if (!TransferRules.isTransferUrl(request.url)) throw invalid("url must be an absolute http or https URL")
                // The shell picks where a download goes. A caller able to name the path could
                // overwrite the app's own files, and the page asking is loaded from the network.
                if (!request.fileUri.isNullOrBlank()) throw invalid("download takes no file.uri; the shell chooses the file")
                0L
            }
        }

        val now = clock()
        if (entries.values.none { it.state == TransferState.RUNNING }) {
            batch.clear()
            batchStartedAt = now
            batchSequence++
        }
        val entry = Entry(transferId, direction, totalBytes, request.title?.takeIf { it.isNotBlank() })
        entry.lastEmittedAt = now
        entries[transferId] = entry
        batch.add(entry)
        return entry.snapshot()
    }

    /**
     * Records the cumulative byte count the transport reported. Returns a `running` event when one
     * is due, or null when the value is stored silently (throttled, not an increase, or the
     * transfer is unknown or already ended).
     */
    fun progress(transferId: String, bytes: Long): TransferSnapshot? {
        val entry = runningEntry(transferId) ?: return null
        var next = maxOf(bytes, entry.transferredBytes)
        if (entry.totalBytes > 0) next = minOf(next, entry.totalBytes)
        if (next <= entry.transferredBytes) return null

        val now = clock()
        entry.transferredBytes = next
        entry.lastProgressAt = now
        if (now - entry.lastEmittedAt < PROGRESS_INTERVAL_MS) return null
        entry.lastEmittedAt = now
        return entry.snapshot()
    }

    /**
     * A download's response headers arrived: [contentLength] (-1 when absent, as chunked replies
     * have none) becomes its progress denominator, 0 meaning unknown. Nothing is emitted; the next
     * event carries it. Ignored for an upload, whose length was declared at start.
     */
    fun expectLength(transferId: String, contentLength: Long) {
        val entry = runningEntry(transferId)?.takeIf { it.direction == TransferDirection.DOWNLOAD } ?: return
        entry.totalBytes = DownloadFiles.totalBytes(contentLength)
    }

    /**
     * The server answered. Any status is `responded` — whether 403 or 412 is a failure is decided
     * above the shell, which knows the storage contract. Returns null for an unknown or ended id.
     *
     * [file] is the download's committed file. It is kept only for a download answered with a 2xx
     * ([DownloadFiles.keepsBody]); the OS layer writes no file otherwise, and this holds the line
     * even if it did.
     */
    fun response(transferId: String, httpStatus: Int, body: String?, file: DownloadedFile? = null): TransferSnapshot? {
        val entry = runningEntry(transferId) ?: return null
        entry.httpStatus = httpStatus
        entry.providerCode = if (httpStatus >= 300) TransferRules.parseProviderCode(body) else null
        entry.file = file?.takeIf { entry.direction == TransferDirection.DOWNLOAD && DownloadFiles.keepsBody(httpStatus) }
        return settle(entry, TransferState.RESPONDED)
    }

    /** No response arrived. Returns null for an unknown or ended id. */
    fun failure(transferId: String, code: TransferErrorCode, message: String?): TransferSnapshot? {
        val entry = runningEntry(transferId) ?: return null
        entry.errorCode = code
        entry.errorMessage = TransferRules.sanitizeMessage(message)
        return settle(entry, TransferState.FAILED)
    }

    /**
     * Cancels a running transfer. The OS layer must stop its transport; whatever the transport
     * reports afterwards is ignored because the entry is already terminal.
     *
     * @throws TransferRejectedException with [TransferErrorCode.INVALID] when the id is unknown or
     *   already ended — including a cancel that lost the race against the response.
     */
    fun cancel(transferId: String): TransferSnapshot {
        val entry = entries[transferId] ?: throw invalid("unknown transferId")
        if (entry.state.isTerminal) throw invalid("transfer already ended")
        return settle(entry, TransferState.CANCELLED)
    }

    /** Cancels every running transfer (the notification's Cancel action). */
    fun cancelAllRunning(): List<TransferSnapshot> =
        runningEntries().map { settle(it, TransferState.CANCELLED) }

    /**
     * Fails every running transfer with [code] — Android uses it with [TransferErrorCode.SYSTEM]
     * when the OS ends the data-sync foreground service. The ids of the returned events are the
     * transports to stop.
     */
    fun failAllRunning(code: TransferErrorCode, message: String? = null): List<TransferSnapshot> =
        runningEntries().map {
            it.errorCode = code
            it.errorMessage = TransferRules.sanitizeMessage(message)
            settle(it, TransferState.FAILED)
        }

    /**
     * The system's continued-processing task expired. It is treated as a cancellation because the
     * OS does not say whether the user or the system ended it. Only uploads are cancelled: a download
     * never joins that task, so its expiry says nothing about one.
     */
    fun continuedTaskExpired(): List<TransferSnapshot> =
        runningEntries().filter { joinsSystemProgress(it.direction) }.map { settle(it, TransferState.CANCELLED) }

    /** Drops the acknowledged terminal entries. Running and unknown ids are ignored. */
    fun ack(transferIds: Collection<String>): Int {
        for (id in transferIds) {
            val entry = entries[id] ?: continue
            if (entry.state.isTerminal) entries.remove(id)
        }
        return entries.size
    }

    // ---- Queries --------------------------------------------------------------------------------

    /** Running transfers plus unacknowledged terminal ones, in start order. */
    fun list(): List<TransferSnapshot> = entries.values.map { it.snapshot() }

    fun state(transferId: String): TransferState? = entries[transferId]?.state

    fun hasRunning(): Boolean = entries.values.any { it.state == TransferState.RUNNING }

    /** Ids of the running downloads, whose folders the sweep must leave alone. */
    fun runningDownloads(): List<String> =
        runningEntries().filter { it.direction == TransferDirection.DOWNLOAD }.map { it.transferId }

    /**
     * Whether the system progress UI (the iOS continued-processing task) should start: only while an
     * upload runs. A download is a few seconds the user waits through on screen, where the page shows
     * its progress; a system progress bar for it would be noise.
     */
    fun shouldStartContinuedTask(): Boolean = runningEntries().any { joinsSystemProgress(it.direction) }

    /**
     * The batch as the notification shows it. The ratio is byte-weighted — a settled member counts
     * as its full total — never an average of per-file ratios, which would read 90 % for nine tiny
     * finished files next to one large untouched one.
     */
    fun batchStatus(): BatchStatus {
        // The percentage follows the uploads whenever the batch has any. A download learns its
        // length only from a 2xx reply, so one that ended otherwise — or a chunked one — stays at an
        // unknown total and would hold an upload's bar indeterminate until the batch ends.
        val measured = batch.filter { joinsSystemProgress(it.direction) }.ifEmpty { batch }
        val ratio = if (measured.isEmpty() || measured.any { it.totalBytes == 0L }) {
            null
        } else {
            val total = measured.sumOf { it.totalBytes }.toDouble()
            val counted = measured.sumOf { if (it.state.isTerminal) it.totalBytes else it.transferredBytes }
            counted / total
        }
        return BatchStatus(
            sequence = batchSequence,
            members = batch.size,
            directions = batch.mapTo(LinkedHashSet()) { it.direction },
            running = batch.filter { it.state == TransferState.RUNNING }
                .map { RunningTransfer(it.transferId, it.direction, it.title) },
            failed = batch.count { it.state == TransferState.FAILED },
            ratio = ratio,
            uploads = batch.count { it.direction == TransferDirection.UPLOAD },
            failedUploads = batch.count { it.direction == TransferDirection.UPLOAD && it.state == TransferState.FAILED },
        )
    }

    /**
     * True when the system progress UI should close: something is running but no byte moved for
     * [STALL_TIMEOUT_MS]. It never cancels a transfer — the transfer keeps going without the UI.
     */
    fun shouldCloseContinuedTask(now: Long = clock()): Boolean {
        if (!shouldStartContinuedTask()) return false
        val lastActivity = batch.filter { joinsSystemProgress(it.direction) }.mapNotNull { it.lastProgressAt }.maxOrNull()
            ?.let { maxOf(it, batchStartedAt) } ?: batchStartedAt
        return now - lastActivity >= STALL_TIMEOUT_MS
    }

    // ---- Internals ------------------------------------------------------------------------------

    /** The system surfaces that stand in for the page — the iOS progress task, failure notices — cover uploads only. */
    private fun joinsSystemProgress(direction: TransferDirection) = direction == TransferDirection.UPLOAD

    private fun runningEntry(transferId: String): Entry? =
        entries[transferId]?.takeIf { it.state == TransferState.RUNNING }

    private fun runningEntries(): List<Entry> = entries.values.filter { it.state == TransferState.RUNNING }

    /** The single place a transfer becomes terminal, so "exactly one terminal event" holds by construction. */
    private fun settle(entry: Entry, state: TransferState): TransferSnapshot {
        entry.state = state
        entry.terminalSequence = nextTerminalSequence++
        entry.lastEmittedAt = clock()
        enforceRetentionCap()
        return entry.snapshot()
    }

    private fun enforceRetentionCap() {
        val terminal = entries.values.filter { it.state.isTerminal }
        if (terminal.size <= RETENTION_CAP) return
        terminal.sortedBy { it.terminalSequence }
            .take(terminal.size - RETENTION_CAP)
            .forEach {
                entries.remove(it.transferId)
                log("retention cap reached, dropped unacknowledged result ${it.transferId}")
            }
    }

    private fun invalid(message: String) = TransferRejectedException(TransferErrorCode.INVALID, message)
}
