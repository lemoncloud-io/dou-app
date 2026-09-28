package io.chatic.dou.transfer.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TransferNoticeTest {

    private fun status(
        running: List<RunningTransfer>,
        failed: Int = 0,
        members: Int = running.size,
        ratio: Double? = 0.5,
        directions: Set<TransferDirection> = running.mapTo(HashSet()) { it.direction },
    ) = BatchStatus(sequence = 1, members = members, directions = directions, running = running, failed = failed, ratio = ratio)

    private fun up(id: String, title: String? = null) = RunningTransfer(id, TransferDirection.UPLOAD, title)

    @Test
    fun progress_isNullWhenNothingRuns() {
        assertNull(TransferNotice.progress(status(emptyList(), members = 2)))
    }

    @Test
    fun progress_single_showsItsTitleAndPercent() {
        assertEquals(
            ProgressNotice(TransferDirection.UPLOAD, runningCount = 1, title = "photo.jpg", percent = 42),
            TransferNotice.progress(status(listOf(up("a", "photo.jpg")), ratio = 0.429)),
        )
    }

    @Test
    fun progress_several_showsCountAndNoTitle() {
        val notice = TransferNotice.progress(status(listOf(up("a", "x"), up("b", "y"))))!!
        assertEquals(2, notice.runningCount)
        assertNull(notice.title)
        assertEquals(50, notice.percent)
    }

    @Test
    fun progress_mixedDirections_hasNoSingleDirection() {
        val running = listOf(up("a"), RunningTransfer("b", TransferDirection.DOWNLOAD, null))
        assertNull(TransferNotice.progress(status(running))!!.direction)
    }

    @Test
    fun progress_indeterminateRatio_hasNoPercent() {
        assertNull(TransferNotice.progress(status(listOf(up("a")), ratio = null))!!.percent)
    }

    @Test
    fun failureSummary_onlyForAFinishedBatchWithFailures() {
        assertNull("still running", TransferNotice.failureSummary(status(listOf(up("a")), failed = 1, members = 3)))
        assertNull(
            "all succeeded",
            TransferNotice.failureSummary(status(emptyList(), members = 3, directions = setOf(TransferDirection.UPLOAD))),
        )
        assertEquals(
            FailureNotice(TransferDirection.UPLOAD, failed = 2, total = 5),
            TransferNotice.failureSummary(
                status(emptyList(), failed = 2, members = 5, directions = setOf(TransferDirection.UPLOAD)),
            ),
        )
    }

    @Test
    fun percentOf_roundsDownAndClamps() {
        assertEquals(99, TransferNotice.percentOf(0.999))
        assertEquals(100, TransferNotice.percentOf(1.0))
        assertEquals(0, TransferNotice.percentOf(-0.1))
        assertEquals(100, TransferNotice.percentOf(1.2))
    }
}
