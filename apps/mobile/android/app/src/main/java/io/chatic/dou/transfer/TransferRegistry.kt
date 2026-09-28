package io.chatic.dou.transfer

import android.os.SystemClock
import android.util.Log
import io.chatic.dou.transfer.core.BatchStatus
import io.chatic.dou.transfer.core.TransferCore
import io.chatic.dou.transfer.core.TransferErrorCode
import io.chatic.dou.transfer.core.TransferRequest
import io.chatic.dou.transfer.core.TransferRules
import io.chatic.dou.transfer.core.TransferSnapshot
import io.chatic.dou.transfer.core.TransferState
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors

/**
 * Process-wide owner of every transfer: the [TransferCore] under one lock, the in-memory transport
 * instructions, and the listeners that relay state changes.
 *
 * It lives here, not in the service or the RN module, because both of those come and go. The
 * service stops as soon as nothing is running, and a terminal result has to outlive it until the
 * web acknowledges it — the most common path is "finished in the background, read on return".
 * The RN module is recreated with every React instance.
 */
object TransferRegistry {

    private const val TAG = "TransferRegistry"

    fun interface Listener {
        fun onTransferState(snapshot: TransferSnapshot)
    }

    /**
     * What the transport needs to move the bytes. Held in memory only and dropped as soon as the
     * transfer ends: the URL is a signed credential and the headers are part of its signature.
     */
    class TransportSpec(
        val transferId: String,
        val url: String,
        val headers: Map<String, String>,
        val fileUri: String,
        val contentLength: Long,
    ) {
        override fun toString(): String = "TransportSpec(transferId=$transferId)"
    }

    private val lock = Any()
    private val core = TransferCore(clock = { SystemClock.elapsedRealtime() }, log = { Log.w(TAG, it) })

    /** Accepted transfers whose transport has not picked them up yet. */
    private val pendingSpecs = HashMap<String, TransportSpec>()

    private val listeners = CopyOnWriteArraySet<Listener>()

    /**
     * Delivers events outside the lock, in the order the core produced them. Handing them over
     * while still holding the lock is what keeps that order: a worker's `running` event can never
     * overtake the `cancelled` another thread produced after it.
     */
    private val dispatcher = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "transfer-events").apply { isDaemon = true }
    }

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    /** @throws io.chatic.dou.transfer.core.TransferRejectedException when the core refuses it. */
    fun start(request: TransferRequest): TransferSnapshot = synchronized(lock) {
        val event = core.start(request)
        pendingSpecs[event.transferId] = TransportSpec(
            transferId = event.transferId,
            url = request.url.orEmpty(),
            headers = TransferRules.requestHeaders(request.headers, request.contentType),
            fileUri = request.fileUri.orEmpty(),
            contentLength = event.totalBytes,
        )
        Log.i(TAG, "start ${event.transferId} host=${TransferRules.safeHost(request.url)} bytes=${event.totalBytes}")
        dispatchLocked(listOf(event))
        event
    }

    /** Hands the transport its instructions once. Null when the transfer already ended. */
    fun takeSpec(transferId: String): TransportSpec? = synchronized(lock) {
        val spec = pendingSpecs.remove(transferId)
        if (core.state(transferId) == TransferState.RUNNING) spec else null
    }

    fun progress(transferId: String, bytes: Long) = synchronized(lock) {
        dispatchLocked(listOfNotNull(core.progress(transferId, bytes)))
    }

    fun response(transferId: String, httpStatus: Int, body: String?) = synchronized(lock) {
        dispatchLocked(listOfNotNull(core.response(transferId, httpStatus, body)))
    }

    fun failure(transferId: String, code: TransferErrorCode, message: String?) = synchronized(lock) {
        dispatchLocked(listOfNotNull(core.failure(transferId, code, message)))
    }

    /** @throws io.chatic.dou.transfer.core.TransferRejectedException when it already ended or is unknown. */
    fun cancel(transferId: String): TransferSnapshot = synchronized(lock) {
        core.cancel(transferId).also { dispatchLocked(listOf(it)) }
    }

    /** Cancels every running transfer and returns their ids. */
    fun cancelAllRunning(): List<String> = synchronized(lock) {
        core.cancelAllRunning().also { dispatchLocked(it) }.map { it.transferId }
    }

    /** Fails every running transfer with [code] and returns their ids. */
    fun failAllRunning(code: TransferErrorCode, message: String): List<String> = synchronized(lock) {
        core.failAllRunning(code, message).also { dispatchLocked(it) }.map { it.transferId }
    }

    fun list(): List<TransferSnapshot> = synchronized(lock) { core.list() }

    fun ack(transferIds: Collection<String>): Int = synchronized(lock) { core.ack(transferIds) }

    fun hasRunning(): Boolean = synchronized(lock) { core.hasRunning() }

    fun batchStatus(): BatchStatus = synchronized(lock) { core.batchStatus() }

    private fun dispatchLocked(events: List<TransferSnapshot>) {
        for (event in events) {
            if (event.state.isTerminal) {
                pendingSpecs.remove(event.transferId)
                Log.i(TAG, "end ${event.transferId} state=${event.state.wire} status=${event.httpStatus} error=${event.errorCode}")
            }
            dispatcher.execute {
                for (listener in listeners) {
                    try {
                        listener.onTransferState(event)
                    } catch (e: Exception) {
                        Log.w(TAG, "listener failed for ${event.transferId}", e)
                    }
                }
            }
        }
    }
}
