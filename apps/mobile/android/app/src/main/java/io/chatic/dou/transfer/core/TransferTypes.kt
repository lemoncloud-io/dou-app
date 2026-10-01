package io.chatic.dou.transfer.core

/**
 * Value types of the file-transfer core.
 *
 * Everything in this package is plain Kotlin on purpose: the rules it holds are the ones both
 * platforms must agree on, and keeping `android.*` out lets them run as JVM unit tests with a fake
 * clock. The wire names below are the strings of the JS contract (`file-transfer.ts`).
 */

enum class TransferDirection(val wire: String) {
    UPLOAD("upload"),
    DOWNLOAD("download");

    companion object {
        fun fromWire(value: String?): TransferDirection? = entries.firstOrNull { it.wire == value }
    }
}

enum class TransferState(val wire: String) {
    RUNNING("running"),
    RESPONDED("responded"),
    FAILED("failed"),
    CANCELLED("cancelled");

    val isTerminal: Boolean get() = this != RUNNING
}

/** Why a transfer failed or a call was rejected. The name is the wire code. */
enum class TransferErrorCode {
    NETWORK,
    SOURCE,
    INVALID,
    SYSTEM,
    INTERNAL,
}

/** A call the core refused. The OS layer passes [code] through as the promise rejection code. */
class TransferRejectedException(val code: TransferErrorCode, message: String) : RuntimeException(message)

/**
 * A start request as it arrived over the bridge, before validation. Fields are nullable because the
 * bridge hands over whatever the caller sent; deciding what is acceptable is the core's job.
 *
 * Not a data class: the generated `toString` would print [url] and [headers], and the signed URL
 * carries a credential in its query string. Nothing here may reach a log by accident.
 */
class TransferRequest(
    val transferId: String?,
    val direction: String?,
    val url: String?,
    val method: String?,
    val headers: Map<String, String> = emptyMap(),
    val fileUri: String?,
    val contentType: String? = null,
    /** JS numbers arrive as doubles; the core checks that the value is a whole, non-negative number. */
    val contentLength: Double?,
    val title: String? = null,
    /** `download` only: the file name hint (`file.name`). Where the file goes is the shell's choice. */
    val fileName: String? = null,
) {
    override fun toString(): String = "TransferRequest(transferId=$transferId, direction=$direction)"
}

/** State of one transfer, exactly the fields of the bridge payload `OnFileTransferStatePayload`. */
data class TransferSnapshot(
    val transferId: String,
    val direction: TransferDirection,
    val state: TransferState,
    val transferredBytes: Long,
    val totalBytes: Long,
    val httpStatus: Int? = null,
    val providerCode: String? = null,
    val errorCode: TransferErrorCode? = null,
    val errorMessage: String? = null,
    /** A committed download's file; only on a download that ended `responded` with a 2xx status. */
    val file: DownloadedFile? = null,
)

/** The file a download wrote, as the bridge payload `DownloadedFile` carries it. */
data class DownloadedFile(
    /** `file://` URI inside the download folder. */
    val uri: String,
    val size: Long,
    /** The response's `Content-Type`, passed through unjudged. */
    val contentType: String? = null,
)

/** A running transfer as the notification needs it — never a URL or a path. */
data class RunningTransfer(
    val transferId: String,
    val direction: TransferDirection,
    val title: String?,
)

/**
 * The current batch, for the system notification only. The bridge never carries a ratio; the web
 * computes its own from bytes.
 *
 * @property sequence identifies the batch; a new batch gets a new value, so the OS layer can tell a
 *   batch it already summarised from a new one.
 * @property members every transfer that joined the batch, including ones already acknowledged.
 * @property directions the directions of all members, for direction-aware wording.
 * @property uploads the upload members; a download is announced by the page that asked for it.
 * @property ratio byte-weighted progress in 0..1, or null when it cannot be known (a member with an
 *   unknown total, or no batch at all).
 */
data class BatchStatus(
    val sequence: Long,
    val members: Int,
    val directions: Set<TransferDirection>,
    val running: List<RunningTransfer>,
    val failed: Int,
    val ratio: Double?,
    /** Upload members, and how many of them failed — the failure summary counts uploads only. */
    val uploads: Int = members,
    val failedUploads: Int = failed,
)
