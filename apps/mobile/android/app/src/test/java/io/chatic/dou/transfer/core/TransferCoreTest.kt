package io.chatic.dou.transfer.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Core branches beyond the shared U1–U16 list. */
class TransferCoreTest {

    private val clock = FakeClock()
    private val core = newCore(clock)

    // ---- start validation -----------------------------------------------------------------------

    @Test
    fun start_rejectsMissingOrBlankTransferId() {
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(transferId = null)) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(transferId = "  ")) }
    }

    @Test
    fun start_rejectsUnknownOrMissingDirection() {
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(direction = "sideways")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(direction = null)) }
    }

    @Test
    fun start_rejectsUploadWithAMethodOtherThanPut() {
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(method = "POST")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(method = "GET")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(method = null)) }
    }

    @Test
    fun start_rejectsAUrlThatIsNotAnAbsoluteHttpUrl() {
        // A distinct id per case, so a duplicate id can never be what rejects it.
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("missing", url = null)) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("file", url = "file:///tmp/a.bin")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("text", url = "not a url")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("hostless", url = "https:///no-host")) }
        // Nothing was registered by the refused attempts, so the id is still free.
        core.start(upload("missing"))
    }

    @Test
    fun start_rejectsBlankFileUri() {
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(fileUri = "")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload(fileUri = null)) }
    }

    @Test
    fun start_download_rejectsAUrlThatIsNotAnAbsoluteHttpUrl_andAMissingMethod() {
        assertRejected(TransferErrorCode.INVALID) { core.start(download("file", url = "file:///data/app.db")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(download("hostless", url = "https:///no-host")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(download("method", method = null)) }
        assertTrue(core.list().isEmpty())
    }

    @Test
    fun start_download_treatsABlankFileUriAsAbsent_andNeedsNoLength() {
        val event = core.start(download("blank", fileUri = "  ", fileName = null))
        assertEquals(TransferState.RUNNING, event.state)
        assertEquals(0L, event.totalBytes)
    }

    @Test
    fun download_progressIsClampedOnceTheLengthIsKnown_andTheFileIsHeldUntilAck() {
        core.start(download("d"))
        core.expectLength("d", 100)
        clock.advance(500)
        assertEquals(100L, core.progress("d", 250)?.transferredBytes)

        core.response("d", 200, null, downloadedFile())
        assertEquals(downloadedFile(), core.list().single().file)
        core.ack(listOf("d"))
        assertTrue(core.list().isEmpty())
    }

    @Test
    fun batch_ratioFollowsTheUploads_soADownloadWithoutALengthDoesNotHideTheirProgress() {
        core.start(upload("u", contentLength = 1_000.0))
        clock.advance(500)
        core.progress("u", 400)
        core.start(download("d"))
        assertEquals(0.4, core.batchStatus().ratio!!, 0.0001)

        // Ended without ever learning its length (a 403): the upload's bar is still measured.
        core.response("d", 403, null)
        assertEquals(0.4, core.batchStatus().ratio!!, 0.0001)
        assertEquals("the download is still listed in the batch", 2, core.batchStatus().members)
    }

    @Test
    fun batch_downloadOnly_isMeasuredByItsDownloads() {
        core.start(download("d"))
        assertNull("length not known yet", core.batchStatus().ratio)
        core.expectLength("d", 200)
        clock.advance(500)
        core.progress("d", 50)
        assertEquals(0.25, core.batchStatus().ratio!!, 0.0001)
    }

    @Test
    fun expectLength_afterTheEnd_orForAnUnknownId_isIgnored() {
        core.start(download("d"))
        core.failure("d", TransferErrorCode.NETWORK, "reset")
        core.expectLength("d", 100)
        core.expectLength("nobody", 100)
        assertEquals(0L, core.list().single().totalBytes)
    }

    @Test
    fun start_rejectsMissingNegativeFractionalOrNonFiniteContentLength() {
        for (length in listOf(null, -1.0, 1.5, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertRejected(TransferErrorCode.INVALID) { core.start(upload(contentLength = length)) }
        }
        assertTrue("a rejected start registers nothing", core.list().isEmpty())
    }

    @Test
    fun start_acceptsAnEmptyFile() {
        val event = core.start(upload(contentLength = 0.0))
        assertEquals(0L, event.totalBytes)
    }

    @Test
    fun request_toStringNeverShowsUrlOrHeaders() {
        val text = upload(headers = mapOf("x-amz-security-token" to "token")).toString()
        assertFalse(text.contains("Signature"))
        assertFalse(text.contains("token"))
        assertTrue(text.contains("t1"))
    }

    // ---- progress -------------------------------------------------------------------------------

    @Test
    fun progress_isClampedToTotal() {
        core.start(upload(contentLength = 100.0))
        clock.advance(300)
        assertEquals(100L, core.progress("t1", 250)?.transferredBytes)
    }

    @Test
    fun progress_withUnknownTotal_isOnlyMonotonic() {
        core.start(upload(contentLength = 0.0))
        clock.advance(300)
        assertEquals(5_000L, core.progress("t1", 5_000)?.transferredBytes)
        clock.advance(300)
        assertNull(core.progress("t1", 4_000))
        assertEquals(5_000L, core.list().single().transferredBytes)
    }

    @Test
    fun progress_forUnknownId_isIgnored() {
        assertNull(core.progress("nope", 10))
    }

    @Test
    fun progress_withoutIncrease_doesNotResetTheStallTimer() {
        val startedAt = clock.now
        core.start(upload(contentLength = 100.0))
        clock.now = startedAt + 10_000
        core.progress("t1", 100)
        clock.now = startedAt + 35_000
        core.progress("t1", 100)

        assertTrue(core.shouldCloseContinuedTask(startedAt + 40_000))
    }

    // ---- response / failure ---------------------------------------------------------------------

    @Test
    fun response_below300_hasNoProviderCodeEvenWithAnXmlBody() {
        core.start(upload())
        assertNull(core.response("t1", 200, "<Code>Unexpected</Code>")?.providerCode)
    }

    @Test
    fun failure_carriesCodeAndSanitizedMessage_orNoMessage() {
        core.start(upload("a"))
        val failed = core.failure("a", TransferErrorCode.SOURCE, "cannot open file://x/y.jpg")
        assertEquals(TransferErrorCode.SOURCE, failed?.errorCode)
        assertEquals("cannot open [url]", failed?.errorMessage)

        core.start(upload("b"))
        assertNull(core.failure("b", TransferErrorCode.NETWORK, null)?.errorMessage)
    }

    // ---- cancel ---------------------------------------------------------------------------------

    @Test
    fun cancel_unknownId_isInvalid() {
        assertRejected(TransferErrorCode.INVALID) { core.cancel("nope") }
    }

    @Test
    fun cancelAllRunning_cancelsOnlyRunningOnes() {
        core.start(upload("a"))
        core.start(upload("b"))
        core.response("a", 200, null)

        val events = core.cancelAllRunning()

        assertEquals(listOf("b"), events.map { it.transferId })
        assertEquals(TransferState.CANCELLED, core.state("b"))
        assertEquals(TransferState.RESPONDED, core.state("a"))
    }

    // ---- failAllRunning -------------------------------------------------------------------------

    @Test
    fun failAllRunning_failsRunningWithTheGivenCode_andLeavesTerminalOnes() {
        core.start(upload("a"))
        core.start(upload("b"))
        core.start(upload("c"))
        core.cancel("c")

        val events = core.failAllRunning(TransferErrorCode.SYSTEM, "data sync time limit")

        assertEquals(listOf("a", "b"), events.map { it.transferId })
        assertTrue(events.all { it.state == TransferState.FAILED && it.errorCode == TransferErrorCode.SYSTEM })
        assertEquals("data sync time limit", events.first().errorMessage)
        assertEquals(TransferState.CANCELLED, core.state("c"))
        assertFalse(core.hasRunning())
    }

    // ---- list / ack -----------------------------------------------------------------------------

    @Test
    fun list_isInStartOrder_regardlessOfWhenEachEnded() {
        core.start(upload("a"))
        core.start(upload("b"))
        core.start(upload("c"))
        core.response("c", 200, null)
        core.response("a", 200, null)

        assertEquals(listOf("a", "b", "c"), core.list().map { it.transferId })
    }

    @Test
    fun ack_removesOnlyTerminalOnes_andIgnoresUnknownIds() {
        core.start(upload("done"))
        core.start(upload("running"))
        core.response("done", 200, null)

        assertEquals(1, core.ack(listOf("done", "running", "ghost")))
        assertEquals(listOf("running"), core.list().map { it.transferId })
    }

    // ---- batch ----------------------------------------------------------------------------------

    @Test
    fun batch_joinsWhileRunning_andRestartsOnceNothingRuns() {
        core.start(upload("a", contentLength = 100.0))
        core.start(upload("b", contentLength = 300.0))
        val first = core.batchStatus()
        assertEquals(2, first.members)

        core.response("a", 200, null)
        core.response("b", 200, null)
        core.start(upload("c", contentLength = 50.0))
        val second = core.batchStatus()

        assertEquals(1, second.members)
        assertNotEquals(first.sequence, second.sequence)
        assertEquals(0.0, second.ratio!!, 0.0)
    }

    @Test
    fun batch_countsAnAcknowledgedMemberAsSettled() {
        core.start(upload("a", contentLength = 100.0))
        core.start(upload("b", contentLength = 100.0))
        core.response("a", 200, null)
        core.ack(listOf("a"))

        assertEquals(0.5, core.batchStatus().ratio!!, 0.0)
        assertEquals(2, core.batchStatus().members)
    }

    @Test
    fun batch_countsRunningBytes_andFailedMembers() {
        core.start(upload("a", contentLength = 100.0))
        core.start(upload("b", contentLength = 100.0))
        clock.advance(300)
        core.progress("b", 50)
        core.failure("a", TransferErrorCode.NETWORK, "reset")

        val status = core.batchStatus()
        assertEquals(0.75, status.ratio!!, 0.0)
        assertEquals(1, status.failed)
        assertEquals(listOf("b"), status.running.map { it.transferId })
        assertEquals(setOf(TransferDirection.UPLOAD), status.directions)
    }

    @Test
    fun batch_isEmptyBeforeAnyStart() {
        val status = core.batchStatus()
        assertEquals(0, status.members)
        assertNull(status.ratio)
    }

    @Test
    fun batch_keepsTheTitle_andDropsABlankOne() {
        core.start(upload("a", title = "photo.jpg"))
        core.start(upload("b", title = " "))

        assertEquals(listOf("photo.jpg", null), core.batchStatus().running.map { it.title })
    }

    // ---- stall ----------------------------------------------------------------------------------

    @Test
    fun stall_isNeverReportedWhileNothingRuns() {
        core.start(upload())
        core.response("t1", 200, null)

        assertFalse(core.shouldCloseContinuedTask(clock.now + 60_000))
    }
}
