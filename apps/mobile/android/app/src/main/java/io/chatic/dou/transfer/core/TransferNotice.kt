package io.chatic.dou.transfer.core

/**
 * What the ongoing transfer notification says, decided without any Android type so the rules are
 * unit-tested. The OS layer only turns it into strings and a `Notification`.
 *
 * @property direction the wording to use; null when the running transfers move both ways.
 * @property title the single transfer's `title`, or null (the OS layer then uses the
 *   direction-specific default). Always null when several transfers run.
 * @property percent 0..100, or null for an indeterminate bar.
 */
data class ProgressNotice(
    val direction: TransferDirection?,
    val runningCount: Int,
    val title: String?,
    val percent: Int?,
)

/** The one summary left behind when a batch ended with at least one failure. */
data class FailureNotice(
    val direction: TransferDirection?,
    val failed: Int,
    val total: Int,
)

object TransferNotice {

    /** The ongoing notification, or null when nothing is running. */
    fun progress(status: BatchStatus): ProgressNotice? {
        if (status.running.isEmpty()) return null
        val directions = status.running.mapTo(HashSet()) { it.direction }
        return ProgressNotice(
            direction = directions.singleOrNull(),
            runningCount = status.running.size,
            title = status.running.singleOrNull()?.title,
            percent = status.ratio?.let { percentOf(it) },
        )
    }

    /**
     * The summary for a finished batch, or null when it should post nothing: the batch is still
     * running, or every transfer ended without failing. Success is not announced — the app shows it.
     */
    fun failureSummary(status: BatchStatus): FailureNotice? {
        if (status.running.isNotEmpty() || status.failed == 0) return null
        return FailureNotice(
            direction = status.directions.singleOrNull(),
            failed = status.failed,
            total = status.members,
        )
    }

    /** Rounded down, so the bar reads 100 % only once every byte has moved. */
    fun percentOf(ratio: Double): Int = (ratio * 100).toInt().coerceIn(0, 100)
}
