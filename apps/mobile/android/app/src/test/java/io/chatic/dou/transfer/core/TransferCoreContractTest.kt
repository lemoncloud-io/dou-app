package io.chatic.dou.transfer.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.file.Files

/**
 * The cases both platforms must pass (U1–U25). The iOS suite carries the same numbers, so a number
 * missing on either side means the platforms no longer promise the same behaviour. U19–U22 pin the
 * download-folder rules in [DownloadFiles], U25 the upload-source rule in [UploadSources].
 */
class TransferCoreContractTest {

    private val clock = FakeClock()
    private val log = mutableListOf<String>()
    private val core = newCore(clock, log)

    @get:Rule
    val temp = TemporaryFolder()

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
    fun U8_directionAndMethod_downloadGetAccepted_mismatchesAndDownloadFileUriInvalid() {
        val accepted = core.start(download("ok"))
        assertEquals(TransferDirection.DOWNLOAD, accepted.direction)
        assertEquals("the length is learned from the response", 0L, accepted.totalBytes)

        assertRejected(TransferErrorCode.INVALID) { core.start(download("put", method = "PUT")) }
        assertRejected(TransferErrorCode.INVALID) { core.start(upload("get", method = "GET")) }
        assertRejected(TransferErrorCode.INVALID) {
            core.start(download("uri", fileUri = "file:///data/user/0/app/databases/app.db"))
        }
        assertEquals(listOf("ok"), core.list().map { it.transferId })
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

    // ---- U17–U24: downloads ---------------------------------------------------------------------

    @Test
    fun U17_commit_only2xxKeepsTheBody_everyOtherStatusLeavesNoFile() {
        for (status in listOf(200, 204, 299)) assertTrue("$status", DownloadFiles.keepsBody(status))
        for (status in listOf(199, 301, 403, 404, 500)) assertFalse("$status", DownloadFiles.keepsBody(status))

        core.start(download("ok"))
        assertEquals(downloadedFile(), core.response("ok", 200, null, downloadedFile())?.file)

        val xml = "<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>"
        for (status in listOf(301, 403, 404, 500)) {
            core.start(download("d$status"))
            // Even if a file were reported, a non-2xx answer keeps none: an error document must never
            // reach the photo library under an image's name.
            val event = core.response("d$status", status, xml, downloadedFile())!!
            assertEquals(TransferState.RESPONDED, event.state)
            assertNull("$status", event.file)
        }
        assertEquals("AccessDenied", core.list().single { it.transferId == "d403" }.providerCode)

        core.start(upload("u"))
        assertNull("an upload never carries a file", core.response("u", 200, null, downloadedFile())?.file)
    }

    @Test
    fun U18_denominator_fromContentLength_orUnknownWithout() {
        core.start(download("known"))
        core.expectLength("known", 1_234)
        assertEquals(1_234L, core.list().single { it.transferId == "known" }.totalBytes)

        core.start(download("chunked"))
        core.expectLength("chunked", -1)
        assertEquals(0L, core.list().single { it.transferId == "chunked" }.totalBytes)
        clock.advance(500)
        assertEquals("unknown total: bytes still count up", 900L, core.progress("chunked", 900)?.transferredBytes)

        core.start(upload("u", contentLength = 100.0))
        core.expectLength("u", 5)
        assertEquals("an upload keeps its declared length", 100L, core.list().single { it.transferId == "u" }.totalBytes)
    }

    @Test
    fun U19_exportable_onlyCommittedFilesInsideTheDownloadFolder() {
        val root = File(temp.root, "cache/${DownloadFiles.FOLDER}").apply { mkdirs() }
        val folder = File(root, "abc").apply { mkdirs() }
        val photo = File(folder, "photo.png").apply { writeBytes(PNG) }
        val spaced = File(folder, "a b.png").apply { writeBytes(PNG) }
        File(folder, "next.png.part").writeBytes(PNG)
        val database = File(temp.root, "databases/app.db").apply { parentFile!!.mkdirs(); writeText("secret") }
        val link = File(folder, "link.png").also { Files.createSymbolicLink(it.toPath(), database.toPath()) }
        val otherCache = File(temp.root, "cache/transfer-temp/upload.png").apply { parentFile!!.mkdirs(); writeBytes(PNG) }
        fun uri(path: String) = "file://$path"

        val accepted = DownloadFiles.checkExportable(uri(photo.path), root)
        assertEquals(DownloadFiles.ExportCheck.Accepted(photo.canonicalFile), accepted)
        assertTrue(DownloadFiles.checkExportable(uri(spaced.path).replace(" ", "%20"), root) is DownloadFiles.ExportCheck.Accepted)

        val refused = mapOf(
            "dot-dot escape" to uri("${folder.path}/../../../databases/app.db"),
            "symbolic link escape" to uri(link.path),
            "another folder" to uri(otherCache.path),
            "database directly" to uri(database.path),
            "content scheme" to "content://io.chatic.dou.share.fileprovider/transfer-download/abc/photo.png",
            "https" to "https://bucket.example.com/photo.png",
            "relative path" to "photo.png",
            "file URI with a host" to "file://evil${photo.path}",
            "still receiving" to uri("${folder.path}/next.png.part"),
            "the folder itself" to uri(root.path),
            "a transfer folder" to uri(folder.path),
            "a NUL in the path" to uri("${folder.path}/a%00b.png"),
        )
        for ((case, value) in refused) {
            assertTrue(case, DownloadFiles.checkExportable(value, root) is DownloadFiles.ExportCheck.Invalid)
        }
        assertEquals(DownloadFiles.ExportCheck.Missing, DownloadFiles.checkExportable(uri("${folder.path}/gone.png"), root))
    }

    @Test
    fun U20_sniff_knownImagesByTheirFirstBytes_anythingElseUnsupported() {
        assertEquals(DownloadFiles.ImageType.PNG, DownloadFiles.sniffImage(PNG))
        assertEquals(DownloadFiles.ImageType.JPEG, DownloadFiles.sniffImage(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01)))
        assertEquals(DownloadFiles.ImageType.GIF, DownloadFiles.sniffImage("GIF87a\u0001\u0000\u0001\u0000\u0000\u0000".toByteArray()))
        assertEquals(DownloadFiles.ImageType.GIF, DownloadFiles.sniffImage("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000".toByteArray()))
        assertEquals(DownloadFiles.ImageType.WEBP, DownloadFiles.sniffImage("RIFF\u0024\u0000\u0000\u0000WEBPVP8 ".toByteArray()))

        assertEquals("image/jpeg", DownloadFiles.ImageType.JPEG.mimeType)
        assertEquals("jpg", DownloadFiles.ImageType.JPEG.extension)

        assertNull("XML error body", DownloadFiles.sniffImage("<?xml version=\"1.0\"?><Error/>".toByteArray()))
        assertNull("HTML", DownloadFiles.sniffImage("<!doctype html><html>".toByteArray()))
        assertNull("RIFF but not WebP", DownloadFiles.sniffImage("RIFF\u0024\u0000\u0000\u0000WAVEfmt ".toByteArray()))
        assertNull("empty", DownloadFiles.sniffImage(ByteArray(0)))
        assertNull("fewer than 11 bytes", DownloadFiles.sniffImage(PNG.copyOf(10)))
    }

    @Test
    fun U21_names_cleaned_shortened_extensionFromBytes_collisionsNumbered() {
        val cases = mapOf(
            "../../etc/passwd" to DownloadFiles.NameParts("passwd", null),
            "C:\\Users\\me\\Photo.PNG" to DownloadFiles.NameParts("Photo", "png"),
            "pho\u0000to\u001F\u007F\u0085.jpg" to DownloadFiles.NameParts("photo", "jpg"),
            "a:b*c?\"<>|.png" to DownloadFiles.NameParts("a_b_c_____", "png"),
            "  .hidden.gif. " to DownloadFiles.NameParts("hidden", "gif"),
            "x".repeat(80) + ".gif" to DownloadFiles.NameParts("x".repeat(60), "gif"),
            "\uD83D\uDE00".repeat(70) to DownloadFiles.NameParts("\uD83D\uDE00".repeat(60), null),
            "archive.tar.gz" to DownloadFiles.NameParts("archive.tar", "gz"),
            "notes.not an ext" to DownloadFiles.NameParts("notes.not an ext", null),
            "resume.part" to DownloadFiles.NameParts("resume", null),
            "a.part.part" to DownloadFiles.NameParts("a", null),
            "photo.png.PART" to DownloadFiles.NameParts("photo", "png"),
        )
        for ((hint, parts) in cases) {
            assertEquals(hint, parts, DownloadFiles.nameParts(hint))
            assertEquals("idempotent: $hint", parts, DownloadFiles.nameParts(DownloadFiles.fileName(parts)))
        }
        for (empty in listOf(null, "", "   ", "...", "/", "\u0000")) {
            assertEquals(DownloadFiles.NameParts("image", null), DownloadFiles.nameParts(empty))
        }

        val photo = DownloadFiles.nameParts("photo.png")
        assertEquals("photo.jpg", DownloadFiles.fileName(photo, DownloadFiles.ImageType.JPEG))
        assertEquals("scan.jpg", DownloadFiles.fileName(DownloadFiles.nameParts("scan.jpeg"), DownloadFiles.ImageType.JPEG))
        assertEquals("report.pdf", DownloadFiles.fileName(DownloadFiles.nameParts("report.pdf"), null))
        assertEquals("image.webp", DownloadFiles.fileName(DownloadFiles.nameParts(null), DownloadFiles.ImageType.WEBP))
        assertEquals("photo.png.part", DownloadFiles.partName(photo))

        assertEquals("image.png", DownloadFiles.uniqueName("image.png") { false })
        assertEquals("image (1).png", DownloadFiles.uniqueName("image.png") { it == "image.png" })
        assertEquals("image (2).png", DownloadFiles.uniqueName("image.png") { it in setOf("image.png", "image (1).png") })
        assertEquals("image (1)", DownloadFiles.uniqueName("image") { it == "image" })

        // The folder is a hash of the id, so an id cannot name a path.
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", DownloadFiles.folderName("abc"))
        assertTrue(DownloadFiles.folderName("../../databases").matches(Regex("[0-9a-f]{64}")))
    }

    @Test
    fun U22_sweep_onlyFoldersOlderThan24h_neverARunningTransfers() {
        val hour = 60L * 60 * 1000
        val now = 100 * 24 * hour
        val folders = listOf(
            DownloadFiles.FolderAge("old", now - 24 * hour - 1),
            DownloadFiles.FolderAge("exactly-a-day", now - 24 * hour),
            DownloadFiles.FolderAge("fresh", now - hour),
            DownloadFiles.FolderAge("running", now - 48 * hour),
        )
        assertEquals(listOf("old"), DownloadFiles.foldersToSweep(folders, now, runningFolderNames = setOf("running")))

        core.start(download("r"))
        core.start(upload("u"))
        core.start(download("done"))
        core.response("done", 200, null, downloadedFile())
        assertEquals(listOf("r"), core.runningDownloads())
    }

    @Test
    fun U23_systemSurfaces_downloadOnlyBatch_noProgressTaskNoFailureNotice() {
        core.start(download("d1"))
        assertFalse(core.shouldStartContinuedTask())
        core.failure("d1", TransferErrorCode.NETWORK, "reset")
        assertNull(TransferNotice.failureSummary(core.batchStatus()))

        // Mixed: the upload decides, and the summary counts uploads only.
        val mixed = newCore(FakeClock())
        mixed.start(upload("u1"))
        mixed.start(download("d2"))
        assertTrue(mixed.shouldStartContinuedTask())
        mixed.failure("u1", TransferErrorCode.NETWORK, "reset")
        mixed.failure("d2", TransferErrorCode.NETWORK, "reset")
        assertEquals(FailureNotice(TransferDirection.UPLOAD, failed = 1, total = 1), TransferNotice.failureSummary(mixed.batchStatus()))

        // The task's expiry cancels the uploads it covered and leaves a download running.
        val expiring = newCore(FakeClock())
        expiring.start(upload("u3"))
        expiring.start(download("d3"))
        assertEquals(listOf("u3"), expiring.continuedTaskExpired().map { it.transferId })
        assertEquals(TransferState.RUNNING, expiring.state("d3"))
        assertFalse("nothing left for the task to show", expiring.shouldStartContinuedTask())
        assertFalse(expiring.shouldCloseContinuedTask(Long.MAX_VALUE))
    }

    @Test
    fun U24_requestHeaders_downloadAsksForIdentity_overridingTheCaller_uploadUntouched() {
        val headers = linkedMapOf(
            "ACCEPT-ENCODING" to "gzip",
            "Host" to "bucket.example.com",
            "content-length" to "12",
            "x-amz-date" to "20260930T000000Z",
        )
        assertEquals(
            listOf("x-amz-date" to "20260930T000000Z", "Accept-Encoding" to "identity"),
            TransferRules.downloadHeaders(headers).toList(),
        )
        assertTrue(TransferRules.requestHeaders(emptyMap(), "image/png").keys.none { it.equals("accept-encoding", true) })
    }

    @Test
    fun U25_uploadSource_onlyTheShellsOwnFolders_neverContentUris() {
        val cache = File(temp.root, "cache").apply { mkdirs() }
        val attachPick = File(cache, "attach-pick").apply { mkdirs() }
        val tempFolder = File(cache, UploadSources.TEMP_FOLDER).apply { mkdirs() }
        val roots = listOf(attachPick, tempFolder)
        val picked = File(attachPick, "uuid/clip one.mp4").apply { parentFile!!.mkdirs(); writeBytes(PNG) }
        val written = File(tempFolder, "abc-photo.jpg").apply { writeBytes(PNG) }
        val download = File(cache, "${DownloadFiles.FOLDER}/x/photo.png").apply { parentFile!!.mkdirs(); writeBytes(PNG) }
        val database = File(temp.root, "databases/app.db").apply { parentFile!!.mkdirs(); writeText("secret") }
        val link = File(attachPick, "uuid/link.mp4").also { Files.createSymbolicLink(it.toPath(), database.toPath()) }
        fun uri(path: String) = "file://$path"

        val accepted = listOf(
            uri(picked.path).replace(" ", "%20"),
            uri(written.path),
            written.path,
            "FILE://${written.path}",
            uri("${attachPick.path}/uuid/gone.mp4"),
        )
        for (value in accepted) {
            assertTrue(value, UploadSources.isAllowed(value, roots))
        }

        val refused = mapOf(
            "content URI" to "content://media/picker/0/com.android.providers.media.photopicker/media/1000000123",
            "document URI" to "content://com.android.providers.downloads.documents/document/42",
            "the download folder" to uri(download.path),
            "the database" to uri(database.path),
            "dot-dot escape" to uri("${attachPick.path}/uuid/../../../databases/app.db"),
            "symbolic link escape" to uri(link.path),
            "a sibling with the same prefix" to uri("${cache.path}/attach-pick-other/a.mp4"),
            "the folder itself" to uri(attachPick.path),
            "file URI with a host" to "file://evil${picked.path}",
            "relative path" to "attach-pick/uuid/clip.mp4",
            "https" to "https://bucket.example.com/a.mp4",
            "a NUL" to uri("${attachPick.path}/uuid/a%00b.mp4"),
            "blank" to " ",
        )
        for ((case, value) in refused) {
            assertFalse(case, UploadSources.isAllowed(value, roots))
        }
        assertFalse("null", UploadSources.isAllowed(null, roots))
        assertFalse("no roots", UploadSources.isAllowed(uri(written.path), emptyList()))
    }

    private companion object {
        val PNG = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52)

        fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }
    }
}
