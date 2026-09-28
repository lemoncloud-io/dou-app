package io.chatic.dou.transfer.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The sixteen cases both platforms must pass (U1–U16). The iOS suite carries the same numbers, so a
 * number missing on either side means the platforms no longer promise the same behaviour.
 */
class TransferCoreContractTest {

    private val clock = FakeClock()
    private val log = mutableListOf<String>()
    private val core = newCore(clock, log)

    @Test
    fun U1_start_emitsFirstRunningEventImmediately() {
        val event = core.start(upload("t1", contentLength = 100.0))

        assertEquals(
            TransferSnapshot(
                transferId = "t1",
                direction = TransferDirection.UPLOAD,
                state = TransferState.RUNNING,
                transferredBytes = 0,
                totalBytes = 100,
            ),
            event,
        )
        assertEquals(listOf(event), core.list())
    }

    @Test
    fun U2_inputAfterTerminal_isIgnoredAndEmitsNothing() {
        core.start(upload("t1"))
        core.progress("t1", 40)
        val terminal = core.response("t1", 200, null)
        clock.advance(1_000)

        assertNull(core.progress("t1", 90))
        assertNull(core.response("t1", 500, "<Code>InternalError</Code>"))
        assertNull(core.failure("t1", TransferErrorCode.NETWORK, "reset"))
        assertTrue(core.continuedTaskExpired().isEmpty())
        assertTrue(core.failAllRunning(TransferErrorCode.SYSTEM).isEmpty())
        assertEquals(listOf(terminal), core.list())
    }

    @Test
    fun U3_cancelAndResponseRace_yieldOneTerminal() {
        // Response first: the late cancel is refused and nothing else is emitted.
        core.start(upload("a"))
        val responded = core.response("a", 200, null)
        assertEquals(TransferState.RESPONDED, responded?.state)
        assertRejected(TransferErrorCode.INVALID) { core.cancel("a") }
        assertEquals(TransferState.RESPONDED, core.state("a"))

        // Cancel first: the response that was already in flight is ignored.
        core.start(upload("b"))
        val cancelled = core.cancel("b")
        assertEquals(TransferState.CANCELLED, cancelled.state)
        assertNull(core.response("b", 200, null))
        assertNull(core.failure("b", TransferErrorCode.NETWORK, "socket closed"))
        assertEquals(TransferState.CANCELLED, core.state("b"))
        assertNull(core.list().single { it.transferId == "b" }.httpStatus)
    }

    @Test
    fun U4_terminalResult_staysInListUntilAcked() {
        core.start(upload("t1"))
        core.failure("t1", TransferErrorCode.NETWORK, "timeout")

        assertEquals(TransferState.FAILED, core.list().single().state)
        clock.advance(60_000)
        assertEquals("time alone does not drop it", TransferState.FAILED, core.list().single().state)

        assertEquals(0, core.ack(listOf("t1")))
        assertTrue(core.list().isEmpty())
    }

    @Test
    fun U5_ackOnRunning_isIgnored() {
        core.start(upload("t1"))

        assertEquals(1, core.ack(listOf("t1")))
        assertEquals(TransferState.RUNNING, core.list().single().state)
    }

    @Test
    fun U6_retentionCap_dropsOldestTerminalOn101st() {
        // "second" starts later but ends first, so it is the oldest terminal result.
        core.start(upload("first"))
        core.start(upload("second"))
        core.response("second", 200, null)
        core.response("first", 200, null)
        for (i in 3..100) {
            core.start(upload("t$i"))
            core.response("t$i", 200, null)
        }
        assertEquals(100, core.list().size)

        core.start(upload("t101"))
        core.response("t101", 200, null)

        val ids = core.list().map { it.transferId }
        assertEquals(100, ids.size)
        assertFalse("second" in ids)
        assertTrue("first" in ids)
        assertTrue("t101" in ids)
        assertTrue(log.single().contains("second"))
    }

    @Test
    fun U7_duplicateId_isInvalid() {
        core.start(upload("t1"))
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("t1")) }

        // Still held after it ended, until the owner acknowledges it.
        core.response("t1", 200, null)
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("t1")) }

        core.ack(listOf("t1"))
        assertNotNull(core.start(upload("t1")))
    }

    @Test
    fun U8_download_isInvalid() {
        assertRejected(TransferErrorCode.INVALID) {
            core.start(upload("d1", direction = "download", method = "GET"))
        }
        assertTrue(core.list().isEmpty())
    }

    @Test
    fun U9_progressThrottle_atMostOnePer200ms_terminalImmediate_noEventWithoutIncrease() {
        core.start(upload("t1", contentLength = 1_000.0))

        clock.advance(100)
        assertNull("inside the window: stored silently", core.progress("t1", 10))
        clock.advance(99)
        assertNull(core.progress("t1", 20))
        clock.advance(1)
        assertEquals(30L, core.progress("t1", 30)?.transferredBytes)

        clock.advance(50)
        assertNull(core.progress("t1", 40))
        clock.advance(500)
        assertNull("no increase, no event", core.progress("t1", 40))
        assertNull("a lower value is not an increase either", core.progress("t1", 35))
        assertEquals(50L, core.progress("t1", 50)?.transferredBytes)

        clock.advance(10)
        core.progress("t1", 60)
        val terminal = core.response("t1", 200, null)
        assertEquals("terminal ignores the throttle", TransferState.RESPONDED, terminal?.state)
        assertEquals("terminal carries the latest stored bytes", 60L, terminal?.transferredBytes)
    }

    @Test
    fun U10_batchAggregate_isByteWeighted_andIndeterminateWithZeroTotal() {
        val small = 10.0 * 1024
        val large = 4.0 * 1024 * 1024
        for (i in 1..9) core.start(upload("s$i", contentLength = small))
        core.start(upload("big", contentLength = large))
        for (i in 1..9) core.response("s$i", 200, null)

        val ratio = core.batchStatus().ratio!!
        assertEquals(0.0215, ratio, 0.0001)

        core.start(upload("unknown", contentLength = 0.0))
        assertNull(core.batchStatus().ratio)
    }

    @Test
    fun U11_headerFilter_removesPlatformHeadersCaseInsensitively() {
        val headers = linkedMapOf(
            "Content-Length" to "123",
            "HOST" to "bucket.example.com",
            "x-amz-checksum-sha256" to "abc=",
            "Content-Type" to "image/jpeg",
        )

        assertEquals(
            listOf("x-amz-checksum-sha256" to "abc=", "Content-Type" to "image/jpeg"),
            TransferRules.filterHeaders(headers).toList(),
        )
    }

    @Test
    fun U12_noHttpJudgement_everyStatusIsResponded() {
        for (status in listOf(200, 403, 412)) {
            val id = "t$status"
            core.start(upload(id))
            val event = core.response(id, status, null)
            assertEquals(TransferState.RESPONDED, event?.state)
            assertEquals(status, event?.httpStatus)
            assertNull(event?.errorCode)
        }
    }

    @Test
    fun U13_providerCode_fromS3ErrorXml_absentForNonXml() {
        val xml = """<?xml version="1.0" encoding="UTF-8"?>
            <Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated
            does not match</Message><RequestId>ABC</RequestId></Error>"""
        core.start(upload("xml"))
        assertEquals("SignatureDoesNotMatch", core.response("xml", 403, xml)?.providerCode)

        core.start(upload("plain"))
        assertNull(core.response("plain", 502, "Bad Gateway")?.providerCode)
    }

    @Test
    fun U14_errorMessage_urlReplacedAndTruncatedOnCharacterBoundary() {
        core.start(upload("url"))
        val withUrl = core.failure(
            "url",
            TransferErrorCode.NETWORK,
            "failed to connect to https://bucket.example.com/key?X-Amz-Signature=secret after 30s",
        )
        assertEquals("failed to connect to [url] after 30s", withUrl?.errorMessage)

        // 67 three-byte characters (the euro sign) are 201 bytes; the cut must land before the 67th, not inside it.
        core.start(upload("long"))
        val long = core.failure("long", TransferErrorCode.NETWORK, "\u20AC".repeat(67))?.errorMessage!!
        assertEquals(198, long.toByteArray(Charsets.UTF_8).size)
        assertEquals("\u20AC".repeat(66), long)
    }

    @Test
    fun U15_continuedTaskExpiry_cancelsEveryRunning_leavesTerminalUntouched() {
        core.start(upload("r1"))
        core.start(upload("r2"))
        core.start(upload("done"))
        core.response("done", 200, null)

        val events = core.continuedTaskExpired()

        assertEquals(listOf("r1", "r2"), events.map { it.transferId })
        assertTrue(events.all { it.state == TransferState.CANCELLED })
        assertEquals(TransferState.RESPONDED, core.state("done"))
        assertEquals(200, core.list().single { it.transferId == "done" }.httpStatus)
    }

    @Test
    fun U16_stall_after30sWithoutProgress_closesTaskWithoutCancelling() {
        val startedAt = clock.now
        core.start(upload("t1", contentLength = 1_000.0))

        assertFalse(core.shouldCloseContinuedTask(startedAt + 29_999))
        assertTrue("measured from batch start", core.shouldCloseContinuedTask(startedAt + 30_000))
        assertEquals("deciding to close cancels nothing", TransferState.RUNNING, core.state("t1"))

        // Progress before 30 s resets the timer.
        clock.now = startedAt + 20_000
        core.progress("t1", 10)
        assertFalse(core.shouldCloseContinuedTask(startedAt + 30_000))
        assertFalse(core.shouldCloseContinuedTask(startedAt + 49_999))
        assertTrue(core.shouldCloseContinuedTask(startedAt + 50_000))
        assertEquals(TransferState.RUNNING, core.state("t1"))
    }
}
