package io.chatic.dou.attach.core

import io.chatic.dou.attach.core.AttachPickRules.Kind
import io.chatic.dou.attach.core.AttachPickRules.PickedCheck
import io.chatic.dou.attach.core.AttachPickRules.Source
import io.chatic.dou.attach.core.AttachPickRules.TrackCheck
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.file.Files
import java.util.TimeZone

class AttachPickRulesTest {

    @get:Rule
    val temp = TemporaryFolder()

    private val seoul = TimeZone.getTimeZone("Asia/Seoul")

    // 2026-10-01 09:30:05 in Seoul.
    private val takenAt = 1_790_814_605_000L

    // --- Picker ---

    @Test
    fun limitIsTheRemainingSlotsCappedByTheSystemPicker() {
        assertEquals(7, AttachPickRules.effectiveLimit(7, systemMax = 100))
        assertEquals(3, AttachPickRules.effectiveLimit(7, systemMax = 3))
        assertEquals(7, AttachPickRules.effectiveLimit(7, systemMax = null))
        assertEquals(7, AttachPickRules.effectiveLimit(7, systemMax = 0))
        assertEquals(0, AttachPickRules.effectiveLimit(0, systemMax = 100))
        assertEquals(0, AttachPickRules.effectiveLimit(-1, systemMax = null))
    }

    @Test
    fun aSingleSlotUsesTheSinglePicker() {
        assertTrue(AttachPickRules.picksOne(1))
        assertFalse(AttachPickRules.picksOne(2))
    }

    @Test
    fun aDocumentsPickerThatIgnoresTheLimitIsCutToIt() {
        assertEquals(listOf("a", "b"), AttachPickRules.withinLimit(listOf("a", "b", "c"), 2))
        assertEquals(listOf("a"), AttachPickRules.withinLimit(listOf("a"), 5))
        assertEquals(emptyList<String>(), AttachPickRules.withinLimit(listOf("a"), 0))
    }

    @Test
    fun documentsPickerOffersTheSevenFormatsTheirHancomLabelsAndOctetStream() {
        val types = AttachPickRules.DOCUMENT_MIME_TYPES
        for (type in listOf(
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/x-hwp",
            "application/hwp+zip",
            "text/plain",
            "application/octet-stream",
        )) {
            assertTrue(type, type in types)
        }
        assertFalse("no image or video in the documents picker", types.any { it.startsWith("image/") || it.startsWith("video/") })
    }

    @Test
    fun sourceIsReadFromItsWireName() {
        assertEquals(Source.MEDIA, Source.fromWire("media"))
        assertEquals(Source.DOCUMENT, Source.fromWire("document"))
        assertEquals(null, Source.fromWire("camera"))
        assertEquals(null, Source.fromWire(null))
    }

    // --- What a picked item is ---

    @Test
    fun aMediaPickIsAPhotoByItsTypeAndOtherwiseAVideo() {
        assertEquals(Kind.IMAGE, AttachPickRules.kindOf(Source.MEDIA, "image/heic"))
        assertEquals(Kind.IMAGE, AttachPickRules.kindOf(Source.MEDIA, "IMAGE/JPEG"))
        assertEquals(Kind.VIDEO, AttachPickRules.kindOf(Source.MEDIA, "video/mp4"))
        assertEquals(Kind.VIDEO, AttachPickRules.kindOf(Source.MEDIA, null))
        assertEquals(Kind.FILE, AttachPickRules.kindOf(Source.DOCUMENT, "image/png"))
        assertEquals(Kind.FILE, AttachPickRules.kindOf(Source.DOCUMENT, null))
    }

    @Test
    fun anUnknownTypeIsReportedAsOctetStream() {
        assertEquals("application/octet-stream", AttachPickRules.contentType(null))
        assertEquals("application/octet-stream", AttachPickRules.contentType(" "))
        assertEquals("video/mp4", AttachPickRules.contentType("video/mp4"))
    }

    @Test
    fun sizeIsOverItsLimitOnlyWhenALimitWasGiven() {
        assertTrue(AttachPickRules.exceeds(301, 300))
        assertFalse(AttachPickRules.exceeds(300, 300))
        assertFalse("no limit given", AttachPickRules.exceeds(Long.MAX_VALUE, 0))
    }

    // --- Names ---

    @Test
    fun aDigitsOnlyPickerNameBecomesKindAndCaptureTime() {
        assertEquals("video-20261001-093005.mp4", AttachPickRules.pickedName("1000000123.mp4", Kind.VIDEO, takenAt, 0, seoul))
        assertEquals("photo-20261001-093005.jpg", AttachPickRules.pickedName("1000000124.jpg", Kind.IMAGE, takenAt, 0, seoul))
    }

    @Test
    fun withoutACaptureTimeThePickTimeNamesIt() {
        assertEquals("video-20261001-093005.mp4", AttachPickRules.pickedName("42.mp4", Kind.VIDEO, null, takenAt, seoul))
        assertEquals("video-20261001-093005.mp4", AttachPickRules.pickedName("42.mp4", Kind.VIDEO, 0, takenAt, seoul))
        assertEquals("video-20261001-093005", AttachPickRules.pickedName("42", Kind.VIDEO, null, takenAt, seoul))
    }

    @Test
    fun aRealNameIsKept() {
        for (name in listOf("IMG_0001.mp4", "report 2026.pdf", "2026-10-01.mp4", "v1.mp4", ".mp4")) {
            assertEquals(name, AttachPickRules.pickedName(name, Kind.VIDEO, takenAt, takenAt, seoul))
        }
    }

    @Test
    fun aCopyKeepsTheNameWithoutPathOrControlCharacters() {
        assertEquals("minutes v1.2.pdf", AttachPickRules.safeName("minutes v1.2.pdf", "file"))
        assertEquals("passwd", AttachPickRules.safeName("../../etc/passwd", "file"))
        assertEquals("evil.txt", AttachPickRules.safeName("C:\\tmp\\evil.txt", "file"))
        assertEquals("ab.pdf", AttachPickRules.safeName("a\u0000b\u001F.pdf", "file"))
        assertEquals("file", AttachPickRules.safeName(null, "file"))
        assertEquals("video", AttachPickRules.safeName("  ", "video"))
        assertEquals("file", AttachPickRules.safeName("..", "file"))
    }

    @Test
    fun anOverlongNameIsCutAndKeepsItsExtension() {
        val name = AttachPickRules.safeName("\uAC00".repeat(120) + ".hwpx", "file")
        assertTrue(name.endsWith(".hwpx"))
        assertTrue(name.toByteArray(Charsets.UTF_8).size <= AttachPickRules.MAX_NAME_BYTES)
        assertEquals("\uAC00".repeat(65) + ".hwpx", name)
    }

    @Test
    fun aPreparedVideoIsNamedMp4() {
        assertEquals("clip.mp4", AttachPickRules.mp4Name("clip.MP4"))
        assertEquals("clip.mp4", AttachPickRules.mp4Name("clip.3gp"))
        assertEquals("clip.mp4", AttachPickRules.mp4Name("clip"))
        assertEquals("a.b.mp4", AttachPickRules.mp4Name("a.b.mov"))
        assertEquals(".mp4.mp4", AttachPickRules.mp4Name(".mp4"))
    }

    @Test
    fun thePosterNeverTakesTheVideosOwnName() {
        assertEquals("poster.jpg", AttachPickRules.posterName("clip.mp4"))
        assertEquals("poster (1).jpg", AttachPickRules.posterName("poster.jpg"))
    }

    // --- Which file a request may name ---

    @Test
    fun aPickedPathIsAFileExactlyOnePickFolderDown() {
        val root = "/cache/attach-pick"
        assertTrue(AttachPickRules.isPickedPath("/cache/attach-pick/uuid/clip.mp4", root))
        assertTrue(AttachPickRules.isPickedPath("/cache/attach-pick/uuid/clip.mp4", "$root/"))
        assertFalse("directly in the folder", AttachPickRules.isPickedPath("/cache/attach-pick/clip.mp4", root))
        assertFalse("deeper", AttachPickRules.isPickedPath("/cache/attach-pick/uuid/sub/clip.mp4", root))
        assertFalse("the pick folder itself", AttachPickRules.isPickedPath("/cache/attach-pick/uuid", root))
        assertFalse("the root itself", AttachPickRules.isPickedPath("/cache/attach-pick", root))
        assertFalse("a sibling folder with the same prefix", AttachPickRules.isPickedPath("/cache/attach-pick-other/uuid/clip.mp4", root))
        assertFalse("a .. segment", AttachPickRules.isPickedPath("/cache/attach-pick/../clip.mp4", root))
        assertFalse("an empty segment", AttachPickRules.isPickedPath("/cache/attach-pick//clip.mp4", root))
    }

    @Test
    fun aFileAPickWroteIsAccepted() {
        val root = pickRoot()
        val file = File(root, "uuid/IMG_0001.jpg").also { it.parentFile!!.mkdirs(); it.writeText("x") }
        val check = AttachPickRules.checkPicked(file.toURI().toString(), root)
        assertEquals(PickedCheck.Accepted(file), check)
        assertEquals(PickedCheck.Accepted(file), AttachPickRules.checkPicked("file://${file.path}", root))
    }

    @Test
    fun aFileReachedThroughALinkedCacheKeepsItsWrittenPathSoItsUploadIsAllowed() {
        // Android's cache directory is `/data/user/0/<package>/cache`, a link to `/data/data/<package>/cache`.
        val realCache = File(temp.root, "data-data/cache").also { it.mkdirs() }
        val linkedCache = File(temp.root, "data-user-0-cache").also { Files.createSymbolicLink(it.toPath(), realCache.toPath()) }
        val root = File(linkedCache, AttachPickRules.FOLDER)
        val file = File(root, "uuid/video-20261001-184217.mp4").also { it.parentFile!!.mkdirs(); it.writeText("x") }

        val check = AttachPickRules.checkPicked("file://${file.path}", root)

        assertEquals(PickedCheck.Accepted(file), check)
        val accepted = (check as PickedCheck.Accepted).file
        assertTrue(io.chatic.dou.transfer.core.UploadSources.isAllowed(accepted.toURI().toString(), listOf(root)))
    }

    @Test
    fun aPickedFileThatIsGoneIsMissing() {
        val root = pickRoot()
        assertEquals(PickedCheck.Missing, AttachPickRules.checkPicked("file://${root.path}/uuid/gone.jpg", root))
    }

    @Test
    fun aFileAtAnyOtherPlaceOrSchemeIsInvalid() {
        val root = pickRoot()
        File(root, "loose.jpg").writeText("x")
        File(root, "uuid/sub").mkdirs()
        File(root, "uuid/sub/deep.jpg").writeText("x")
        val sibling = File(root.parentFile, "attach-pick-other/uuid").also { it.mkdirs() }
        File(sibling, "a.jpg").writeText("x")
        val refused = listOf(
            null,
            "",
            "  ",
            "file://${root.path}/loose.jpg",
            "file://${root.path}/uuid/sub/deep.jpg",
            "file://${root.path}/uuid/sub",
            "file://${root.path}/uuid/../uuid/a.jpg",
            "file://${root.path}/uuid/%2E%2E/loose.jpg",
            "file://${root.path}/../attach-pick-other/uuid/a.jpg",
            "file://${sibling.path}/a.jpg",
            "file://${root.path}/uuid/a%00.jpg",
            "content://media/picker/0/com.android.providers.media.photopicker/media/1000000123",
            "file://host${root.path}/uuid/a.jpg",
            "uuid/a.jpg",
            "not a uri",
        )
        for (uri in refused) {
            assertTrue(uri.toString(), AttachPickRules.checkPicked(uri, root) is PickedCheck.Invalid)
        }
    }

    @Test
    fun aLinkCannotPointOutOfItsPickFolder() {
        val root = pickRoot()
        val outside = File(temp.root, "databases/app.db").also { it.parentFile!!.mkdirs(); it.writeText("secret") }
        val loose = File(root, "loose.jpg").also { it.writeText("x") }
        File(root, "uuid").mkdirs()
        val toOutside = File(root, "uuid/out.jpg").also { Files.createSymbolicLink(it.toPath(), outside.toPath()) }
        val toRootLevel = File(root, "uuid/loose.jpg").also { Files.createSymbolicLink(it.toPath(), loose.toPath()) }
        val toFolder = File(root, "uuid/dir.jpg").also { Files.createSymbolicLink(it.toPath(), File(root, "uuid").toPath()) }
        for (link in listOf(toOutside, toRootLevel, toFolder)) {
            assertTrue(link.name, AttachPickRules.checkPicked("file://${link.path}", root) is PickedCheck.Invalid)
        }
    }

    @Test
    fun aKeptPhotosTypeComesFromItsExtension() {
        assertEquals("image/jpeg", AttachPickRules.imageMimeType("IMG_0001.jpg"))
        assertEquals("image/jpeg", AttachPickRules.imageMimeType("a.JPEG"))
        assertEquals("image/png", AttachPickRules.imageMimeType("a.png"))
        assertEquals("image/gif", AttachPickRules.imageMimeType("a.gif"))
        assertEquals("image/webp", AttachPickRules.imageMimeType("a.webp"))
        assertEquals("application/octet-stream", AttachPickRules.imageMimeType("a.heic"))
        assertEquals("application/octet-stream", AttachPickRules.imageMimeType("photo"))
    }

    // --- Sweep ---

    @Test
    fun sweepsOnlyFoldersWhoseNewestChangeIsOverADayOld() {
        val hour = 60L * 60 * 1000
        val now = 100 * 24 * hour
        val folders = listOf(
            AttachPickRules.Folder("old", now - 30 * hour, listOf(now - 25 * hour)),
            AttachPickRules.Folder("exactly-a-day", now - 24 * hour),
            AttachPickRules.Folder("poster-written-later", now - 48 * hour, listOf(now - 48 * hour, now - hour)),
            AttachPickRules.Folder("fresh", now - hour),
            AttachPickRules.Folder("empty-and-old", now - 25 * hour),
        )
        assertEquals(listOf("old", "empty-and-old"), AttachPickRules.foldersToSweep(folders, now))
    }

    // --- Video ---

    @Test
    fun anMp4IsAnFtypBoxThatIsNotQuickTime() {
        assertTrue(AttachPickRules.isMp4Container(box("isom")))
        assertTrue(AttachPickRules.isMp4Container(box("mp42")))
        assertTrue(AttachPickRules.isMp4Container(box("3gp4")))
        assertFalse("a .mov", AttachPickRules.isMp4Container(box("qt  ")))
        assertFalse("no ftyp box", AttachPickRules.isMp4Container("\u0000\u0000\u0000\u0014moovisom".toByteArray(Charsets.ISO_8859_1)))
        assertFalse("too short", AttachPickRules.isMp4Container(box("isom").copyOf(11)))
    }

    @Test
    fun h264WithAacOrNoAudioIsAccepted() {
        assertEquals(TrackCheck.Accepted, AttachPickRules.checkTracks(listOf("video/avc", "audio/mp4a-latm")))
        assertEquals(TrackCheck.Accepted, AttachPickRules.checkTracks(listOf("audio/mp4a-latm", "video/avc")))
        assertEquals(TrackCheck.Accepted, AttachPickRules.checkTracks(listOf("video/avc")))
        assertEquals(TrackCheck.Accepted, AttachPickRules.checkTracks(listOf("VIDEO/AVC", "application/microvideo-meta-stream")))
    }

    @Test
    fun anyOtherCodecOrTrackLayoutIsRefused() {
        val refused = listOf(
            listOf("video/hevc", "audio/mp4a-latm"),
            listOf("video/avc", "audio/3gpp"),
            listOf("video/avc", "audio/mp4a-latm", "audio/mp4a-latm"),
            listOf("video/avc", "video/avc"),
            listOf("audio/mp4a-latm"),
            emptyList(),
            listOf(null),
        )
        for (tracks in refused) {
            assertTrue(tracks.toString(), AttachPickRules.checkTracks(tracks) is TrackCheck.Refused)
        }
    }

    @Test
    fun aQuarterTurnSwapsTheShownSize() {
        assertEquals(1920 to 1080, AttachPickRules.displaySize(1920, 1080, 0))
        assertEquals(1080 to 1920, AttachPickRules.displaySize(1920, 1080, 90))
        assertEquals(1920 to 1080, AttachPickRules.displaySize(1920, 1080, 180))
        assertEquals(1080 to 1920, AttachPickRules.displaySize(1920, 1080, 270))
        assertEquals(1080 to 1920, AttachPickRules.displaySize(1920, 1080, -90))
    }

    // --- Poster ---

    @Test
    fun thePosterFrameIsHalfASecondInOrTheFirstForAShorterVideo() {
        assertEquals(500_000L, AttachPickRules.posterTimeUs(60_000_000L))
        assertEquals(500_000L, AttachPickRules.posterTimeUs(500_000L))
        assertEquals(0L, AttachPickRules.posterTimeUs(400_000L))
        assertEquals(0L, AttachPickRules.posterTimeUs(null))
    }

    @Test
    fun thePosterIsAtMost400OnItsLongSideAndNeverEnlarged() {
        assertEquals(400 to 225, AttachPickRules.posterSize(1920, 1080))
        assertEquals(225 to 400, AttachPickRules.posterSize(1080, 1920))
        assertEquals(400 to 400, AttachPickRules.posterSize(4000, 4000))
        assertEquals(320 to 240, AttachPickRules.posterSize(320, 240))
        assertEquals(400 to 1, AttachPickRules.posterSize(4000, 2))
    }

    @Test
    fun posterQualityStartsAt70AndStepsDown() {
        assertEquals(70, AttachPickRules.POSTER_QUALITIES.first())
        assertEquals(AttachPickRules.POSTER_QUALITIES.sortedDescending(), AttachPickRules.POSTER_QUALITIES)
    }

    @Test
    fun thePosterCapIsTheServers200000BytesNot200KiB() {
        assertEquals(200_000, AttachPickRules.POSTER_MAX_BYTES)
    }

    @Test
    fun aLibraryVideoIsHeldToTheWebsVideoCeiling() {
        assertEquals(300L * 1024 * 1024, AttachPickRules.VIDEO_MAX_BYTES)
        assertTrue(AttachPickRules.exceeds(AttachPickRules.VIDEO_MAX_BYTES + 1, AttachPickRules.VIDEO_MAX_BYTES))
        assertFalse(AttachPickRules.exceeds(AttachPickRules.VIDEO_MAX_BYTES, AttachPickRules.VIDEO_MAX_BYTES))
    }

    // --- One frame of a remote video ---

    private val signed = "https://bucket.s3.ap-northeast-2.amazonaws.com/v/clip.mp4?X-Amz-Signature=abc%2Fdef&X-Amz-Expires=600"

    @Test
    fun aFrameRequestTakesAnHttpsUrlAndPositiveNumbers() {
        assertEquals(AttachPickRules.FrameRequest(signed, 500, 400), AttachPickRules.frameRequest(signed, 500.0, 400.0))
        assertEquals(AttachPickRules.FrameRequest("HTTPS://example.com/a.mp4", 0, 400), AttachPickRules.frameRequest("HTTPS://example.com/a.mp4", 0.0, 400.0))
    }

    @Test
    fun aFrameRequestRefusesAnythingButHttps() {
        for (url in listOf(null, "", "  ", "http://example.com/a.mp4", "file:///data/a.mp4", "content://media/1", "https:///a.mp4", "https://", "not a url", "//example.com/a.mp4")) {
            assertEquals(url.toString(), null, AttachPickRules.frameRequest(url, 500.0, 400.0))
        }
    }

    @Test
    fun aFrameRequestRefusesTimesAndEdgesThatAreNotPositiveFinite() {
        assertEquals(null, AttachPickRules.frameRequest(signed, -1.0, 400.0))
        assertEquals(null, AttachPickRules.frameRequest(signed, Double.NaN, 400.0))
        assertEquals(null, AttachPickRules.frameRequest(signed, Double.POSITIVE_INFINITY, 400.0))
        assertEquals(null, AttachPickRules.frameRequest(signed, 500.0, 0.0))
        assertEquals(null, AttachPickRules.frameRequest(signed, 500.0, -400.0))
        assertEquals(null, AttachPickRules.frameRequest(signed, 500.0, Double.NaN))
        assertEquals(null, AttachPickRules.frameRequest(signed, 500.0, Double.POSITIVE_INFINITY))
    }

    @Test
    fun aFractionalEdgeIsRoundedAndNeverBelowOnePixel() {
        assertEquals(401, AttachPickRules.frameRequest(signed, 0.0, 400.6)?.maxEdge)
        assertEquals(1, AttachPickRules.frameRequest(signed, 0.0, 0.2)?.maxEdge)
        assertEquals(Int.MAX_VALUE, AttachPickRules.frameRequest(signed, 0.0, 1e12)?.maxEdge)
    }

    @Test
    fun theFrameIsAtTheAskedTimeOrTheFirstForAShorterVideo() {
        assertEquals(500_000L, AttachPickRules.frameTimeUs(500, durationMs = 60_000))
        assertEquals(500_000L, AttachPickRules.frameTimeUs(500, durationMs = 500))
        assertEquals(0L, AttachPickRules.frameTimeUs(500, durationMs = 400))
        assertEquals(0L, AttachPickRules.frameTimeUs(0, durationMs = 60_000))
    }

    @Test
    fun anUnknownLengthKeepsTheAskedTime() {
        assertEquals(500_000L, AttachPickRules.frameTimeUs(500, durationMs = null))
        assertEquals(500_000L, AttachPickRules.frameTimeUs(500, durationMs = 0))
    }

    @Test
    fun theFrameBoxNeverEnlargesASmallVideo() {
        assertEquals(400, AttachPickRules.frameBox(400, 1920, 1080))
        assertEquals(400, AttachPickRules.frameBox(400, 1080, 1920))
        assertEquals(320, AttachPickRules.frameBox(400, 320, 240))
        assertEquals(400, AttachPickRules.frameBox(400, null, null))
        assertEquals(400, AttachPickRules.frameBox(400, 0, 0))
    }

    @Test
    fun atMostTwoFramesAreReadAtOnceAndEachIsGiven20Seconds() {
        assertEquals(2, AttachPickRules.FRAME_READS_AT_ONCE)
        assertEquals(20_000L, AttachPickRules.FRAME_TIMEOUT_MS)
    }

    private fun pickRoot(): File = File(temp.root, AttachPickRules.FOLDER).also { it.mkdirs() }

    private fun box(brand: String): ByteArray =
        ("\u0000\u0000\u0000\u0018ftyp" + brand + "\u0000\u0000\u0002\u0000").toByteArray(Charsets.ISO_8859_1)
}
