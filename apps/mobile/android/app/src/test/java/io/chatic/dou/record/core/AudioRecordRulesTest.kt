package io.chatic.dou.record.core

import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.record.core.AudioRecordRules.Action
import io.chatic.dou.record.core.AudioRecordRules.Cause
import io.chatic.dou.record.core.AudioRecordRules.Reason
import io.chatic.dou.transfer.core.UploadSources
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.TimeZone

class AudioRecordRulesTest {

    @get:Rule
    val temp = TemporaryFolder()

    // 2026-10-01 09:30:05 in Seoul.
    private val startedAt = 1_790_814_605_000L

    // --- Limit ---

    @Test
    fun aLimitWithinFiveMinutesIsKept() {
        assertEquals(60_000L, AudioRecordRules.clampMaxDuration(60_000.0))
        assertEquals(300_000L, AudioRecordRules.clampMaxDuration(300_000.0))
        assertEquals(1L, AudioRecordRules.clampMaxDuration(1.0))
    }

    @Test
    fun aFractionIsRoundedUpSoItNeverBecomesNoLimit() {
        assertEquals(1L, AudioRecordRules.clampMaxDuration(0.5))
        assertEquals(1_001L, AudioRecordRules.clampMaxDuration(1_000.2))
    }

    @Test
    fun aMissingNonPositiveNonFiniteOrLargerLimitMeansFiveMinutes() {
        for (requested in listOf(null, 0.0, -1.0, 300_000.5, 600_000.0, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)) {
            assertEquals(requested.toString(), AudioRecordRules.MAX_DURATION_MS, AudioRecordRules.clampMaxDuration(requested))
        }
    }

    // --- Actions ---

    @Test
    fun actionIsReadFromItsWireName() {
        assertEquals(Action.SEND, Action.fromWire("send"))
        assertEquals(Action.CANCEL, Action.fromWire("cancel"))
        assertNull(Action.fromWire("SEND"))
        assertNull(Action.fromWire("stop"))
        assertNull(Action.fromWire(null))
        assertEquals(Cause.SEND, Cause.of(Action.SEND))
        assertEquals(Cause.CANCEL, Cause.of(Action.CANCEL))
    }

    // --- How it ended ---

    @Test
    fun aSendFromOneSecondOnIsSent() {
        assertEquals(Reason.SENT, AudioRecordRules.endReason(Cause.SEND, 1_000, recorderStopped = true))
        assertEquals(Reason.SENT, AudioRecordRules.endReason(Cause.SEND, 42_000, recorderStopped = true))
    }

    @Test
    fun aSendUnderOneSecondIsTooShortEvenWhenStopThrew() {
        assertEquals(Reason.TOO_SHORT, AudioRecordRules.endReason(Cause.SEND, 999, recorderStopped = true))
        assertEquals(Reason.TOO_SHORT, AudioRecordRules.endReason(Cause.SEND, 120, recorderStopped = false))
        assertEquals(Reason.TOO_SHORT, AudioRecordRules.endReason(Cause.SEND, 0, recorderStopped = false))
    }

    @Test
    fun aSendWhoseStopThrewIsInternal() {
        assertEquals(Reason.INTERNAL, AudioRecordRules.endReason(Cause.SEND, 5_000, recorderStopped = false))
    }

    @Test
    fun aCancelIsCancelledHoweverItStopped() {
        assertEquals(Reason.CANCELLED, AudioRecordRules.endReason(Cause.CANCEL, 200, recorderStopped = false))
        assertEquals(Reason.CANCELLED, AudioRecordRules.endReason(Cause.CANCEL, 30_000, recorderStopped = true))
    }

    @Test
    fun theLimitKeepsTheFileWhetherOrNotTheSecondStopThrew() {
        assertEquals(Reason.MAX_DURATION, AudioRecordRules.endReason(Cause.MAX_DURATION, 300_050, recorderStopped = true))
        // The recorder stopped itself at the limit; a second stop that throws leaves the file to the header check.
        assertEquals(Reason.MAX_DURATION, AudioRecordRules.endReason(Cause.MAX_DURATION, 300_050, recorderStopped = false))
    }

    @Test
    fun anInterruptionOrAnErrorEndsWithoutAFile() {
        assertEquals(Reason.INTERRUPTED, AudioRecordRules.endReason(Cause.INTERRUPTION, 5_000, recorderStopped = true))
        assertEquals(Reason.INTERRUPTED, AudioRecordRules.endReason(Cause.INTERRUPTION, 100, recorderStopped = false))
        assertEquals(Reason.INTERNAL, AudioRecordRules.endReason(Cause.ERROR, 5_000, recorderStopped = false))
    }

    @Test
    fun onlySentAndTheLimitKeepTheFile() {
        assertEquals(setOf(Reason.SENT, Reason.MAX_DURATION), Reason.entries.filter(AudioRecordRules::keepsFile).toSet())
    }

    // --- The file ---

    @Test
    fun aKeptFileMustBeMpeg4() {
        assertTrue(AudioRecordRules.hasMp4Header(MP42))
        assertFalse("ftyp at the wrong offset", AudioRecordRules.hasMp4Header("ftypmp42\u0000\u0000\u0000\u0000".toByteArray(Charsets.ISO_8859_1)))
        assertFalse("empty", AudioRecordRules.hasMp4Header(ByteArray(0)))
        assertFalse("cut short", AudioRecordRules.hasMp4Header(MP42.copyOf(7)))
        assertEquals(Reason.SENT, AudioRecordRules.checked(Reason.SENT, MP42))
        assertEquals(Reason.MAX_DURATION, AudioRecordRules.checked(Reason.MAX_DURATION, MP42))
        assertEquals(Reason.INTERNAL, AudioRecordRules.checked(Reason.SENT, ByteArray(0)))
        assertEquals(Reason.INTERNAL, AudioRecordRules.checked(Reason.MAX_DURATION, "RIFF\u0000\u0000\u0000\u0000WAVE".toByteArray()))
        // A deleted file is not checked: its reason stands.
        assertEquals(Reason.CANCELLED, AudioRecordRules.checked(Reason.CANCELLED, ByteArray(0)))
    }

    @Test
    fun theDurationIsHeldToTheLimit() {
        assertEquals(4_200L, AudioRecordRules.durationMs(4_200, 300_000))
        assertEquals(300_000L, AudioRecordRules.durationMs(300_040, 300_000))
        assertEquals(0L, AudioRecordRules.durationMs(-5, 300_000))
    }

    @Test
    fun theNameIsVoiceAndTheLocalStartTime() {
        assertEquals("voice-20261001-093005.m4a", AudioRecordRules.fileName(startedAt, TimeZone.getTimeZone("Asia/Seoul")))
        assertEquals("voice-20261001-003005.m4a", AudioRecordRules.fileName(startedAt, TimeZone.getTimeZone("UTC")))
    }

    @Test
    fun aRecordingIsWhereAPickIsSoTheUploadReadsItAndTheSweepClearsIt() {
        val cache = temp.newFolder("cache")
        val file = AudioRecordRules.recordingFile(cache, "0b5d1e9a-2f4c-4b8e-9d3a-7c6f5e4d3c2b", "voice-20261001-093005.m4a")
        val root = File(cache, AttachPickRules.FOLDER)
        assertEquals(File(root, "0b5d1e9a-2f4c-4b8e-9d3a-7c6f5e4d3c2b/voice-20261001-093005.m4a"), file)
        assertTrue(AttachPickRules.isPickedPath(file.path, root.path))
        assertTrue(UploadSources.isAllowed("file://${file.path}", listOf(root)))
        // The sweep takes folders directly under attach-pick, so a day-old recording's folder is one of them.
        val day = AttachPickRules.SWEEP_AGE_MS
        val folder = AttachPickRules.Folder(file.parentFile!!.name, modifiedAtMs = 0, fileModifiedAtMs = listOf(0))
        assertEquals(listOf(folder.name), AttachPickRules.foldersToSweep(listOf(folder), nowMs = day + 1))
    }

    private companion object {
        /** What Android's MediaRecorder writes at the start of an MPEG-4 file. */
        val MP42 = "\u0000\u0000\u0000\u0018ftypmp42\u0000\u0000\u0000\u0000".toByteArray(Charsets.ISO_8859_1)
    }
}
