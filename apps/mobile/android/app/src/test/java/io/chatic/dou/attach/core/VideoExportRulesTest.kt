package io.chatic.dou.attach.core

import io.chatic.dou.attach.core.VideoExportRules.Failure
import io.chatic.dou.attach.core.VideoExportRules.Step
import io.chatic.dou.attach.core.VideoExportRules.StepChoice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class VideoExportRulesTest {

    private val max = AttachPickRules.VIDEO_MAX_BYTES
    private fun minutes(value: Double): Long = (value * 60_000_000).toLong()

    // --- Size prediction and the two steps ---

    @Test
    fun theInitialTargetsAre10And6MbitPerSecond() {
        assertEquals(10_000_000, Step.P1080.videoBitrate)
        assertEquals(6_000_000, Step.P720.videoBitrate)
        assertEquals(128_000, VideoExportRules.AUDIO_BITRATE)
    }

    @Test
    fun theSizeIsLengthTimesTargetBitrateOverEight() {
        // 60 s at 10 Mbit/s of video and 128 kbit/s of audio.
        assertEquals(75_960_000L, VideoExportRules.predictedBytes(minutes(1.0), Step.P1080))
        assertEquals(45_960_000L, VideoExportRules.predictedBytes(minutes(1.0), Step.P720))
        assertEquals(0L, VideoExportRules.predictedBytes(0, Step.P1080))
    }

    @Test
    fun aShortVideoConvertsAt1080p() {
        assertEquals(StepChoice.Convert(Step.P1080), VideoExportRules.chooseStep(minutes(1.0), max))
        assertEquals(StepChoice.Convert(Step.P1080), VideoExportRules.chooseStep(minutes(4.0), max))
    }

    @Test
    fun aVideoOver1080pCeilingStepsDownTo720pOnce() {
        // 1080p holds about 4.14 minutes under 300 MiB, 720p about 6.85.
        assertEquals(StepChoice.Convert(Step.P720), VideoExportRules.chooseStep(minutes(4.3), max))
        assertEquals(StepChoice.Convert(Step.P720), VideoExportRules.chooseStep(minutes(6.5), max))
    }

    @Test
    fun aVideoOver720pCeilingIsTooLarge() {
        assertEquals(StepChoice.TooLarge, VideoExportRules.chooseStep(minutes(7.0), max))
        assertEquals(StepChoice.TooLarge, VideoExportRules.chooseStep(minutes(60.0), max))
    }

    @Test
    fun theStepBoundariesAreTheCeilingItself() {
        val longest1080 = (max * 8.0 / (Step.P1080.videoBitrate + VideoExportRules.AUDIO_BITRATE) * 1_000_000).toLong()
        assertEquals(StepChoice.Convert(Step.P1080), VideoExportRules.chooseStep(longest1080, max))
        assertEquals(StepChoice.Convert(Step.P720), VideoExportRules.chooseStep(longest1080 + 1_000_000, max))
    }

    @Test
    fun aLengthThatIsNotKnownConvertsAt1080pAndTheResultRecheckDecides() {
        assertEquals(StepChoice.Convert(Step.P1080), VideoExportRules.chooseStep(null, max))
        assertEquals(StepChoice.Convert(Step.P1080), VideoExportRules.chooseStep(0, max))
    }

    // --- Picture size ---

    @Test
    fun a4KPictureIsFittedInto1080p() {
        assertEquals(1920 to 1080, VideoExportRules.targetSize(3840, 2160, Step.P1080))
        assertEquals(1080 to 1920, VideoExportRules.targetSize(2160, 3840, Step.P1080))
        assertEquals(1280 to 720, VideoExportRules.targetSize(3840, 2160, Step.P720))
        assertEquals(720 to 1280, VideoExportRules.targetSize(2160, 3840, Step.P720))
    }

    @Test
    fun theLimitingSideIsTheShortOneForANarrowPicture() {
        // A square 4000 px picture is held by the 1080 short side, not the 1920 long one.
        assertEquals(1080 to 1080, VideoExportRules.targetSize(4000, 4000, Step.P1080))
        // 4:1 panorama: the 1080 short side would give 4320 long, the 1920 long side gives 480 short.
        assertEquals(1920 to 480, VideoExportRules.targetSize(7680, 1920, Step.P1080))
    }

    @Test
    fun aPictureAlreadyInsideTheBoxIsNeverEnlarged() {
        assertEquals(1280 to 720, VideoExportRules.targetSize(1280, 720, Step.P1080))
        assertEquals(640 to 360, VideoExportRules.targetSize(640, 360, Step.P1080))
        assertFalse(VideoExportRules.scales(1920, 1080, Step.P1080))
        assertFalse(VideoExportRules.scales(1280, 720, Step.P1080))
        assertTrue(VideoExportRules.scales(1920, 1080, Step.P720))
        assertTrue(VideoExportRules.scales(3840, 2160, Step.P1080))
    }

    @Test
    fun bothSidesComeOutEven() {
        for ((w, h) in listOf(3841 to 2161, 1919 to 1081, 3000 to 1999, 2161 to 3841, 1281 to 721)) {
            for (step in Step.entries) {
                val (tw, th) = VideoExportRules.targetSize(w, h, step)
                assertEquals("$w x $h at $step", 0, tw % 2)
                assertEquals("$w x $h at $step", 0, th % 2)
                assertTrue("$w x $h at $step", maxOf(tw, th) <= step.longEdge && minOf(tw, th) <= step.shortEdge)
            }
        }
        assertEquals(1280 to 720, VideoExportRules.targetSize(1281, 721, Step.P1080).let { (w, h) -> (w - w % 2) to (h - h % 2) })
    }

    @Test
    fun aSizeThatIsNotKnownIsLeftAlone() {
        assertEquals(0 to 0, VideoExportRules.targetSize(0, 0, Step.P1080))
        assertEquals(-1 to 100, VideoExportRules.targetSize(-1, 100, Step.P1080))
    }

    // --- Names ---

    @Test
    fun theStagingFileIsHiddenAndUniquePerConversion() {
        assertEquals(".export-1234.mp4", VideoExportRules.stagingName("1234"))
        assertTrue(VideoExportRules.isStagingName(VideoExportRules.stagingName("abc")))
        assertFalse(VideoExportRules.isStagingName("clip.mp4"))
        assertFalse(VideoExportRules.isStagingName("poster.jpg"))
        assertFalse(VideoExportRules.stagingName("a") == VideoExportRules.stagingName("b"))
    }

    @Test
    fun theTargetKeepsTheNameWithAnMp4Extension() {
        val folder = File("/cache/attach-pick/u1")
        assertEquals(File(folder, "IMG_0001.mp4"), VideoExportRules.target(File(folder, "IMG_0001.MOV")))
        assertEquals("an mp4 is replaced in place", File(folder, "video-20261103-120000.mp4"), VideoExportRules.target(File(folder, "video-20261103-120000.mp4")))
        assertEquals(File(folder, "clip.mp4"), VideoExportRules.target(File(folder, "clip.3gp")))
    }

    // --- Failures ---

    @Test
    fun aSourceTheDeviceCannotDecodeIsUnsupportedAndNotWorthARetry() {
        assertEquals("UNSUPPORTED", VideoExportRules.failureCode(Failure.DECODER))
    }

    @Test
    fun aMissingSourceIsSourceAndEverythingElseSystem() {
        assertEquals("SOURCE", VideoExportRules.failureCode(Failure.SOURCE))
        assertEquals("SYSTEM", VideoExportRules.failureCode(Failure.OTHER))
    }
}
