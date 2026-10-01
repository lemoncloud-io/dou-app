import XCTest

/// The core rules both platforms promise. U1 to U24 carry the same numbers as the Android suite;
/// the tests after them cover the remaining branches of this implementation. U19 to U22 pin the
/// download-folder rules in `DownloadFiles`.
///
/// This bundle compiles `Bridges/Transfer/Core/*.swift` directly (no app host), so a new file in
/// that folder has to be added to the ChaticTransferCoreTests target as well.
final class TransferCoreTests: XCTestCase {
    private var clock: Int64 = 0
    private var events: [TransferSnapshot] = []
    private var logs: [String] = []
    private var core: TransferCore!

    override func setUp() {
        super.setUp()
        clock = 1_000
        events = []
        logs = []
        core = TransferCore(
            now: { [unowned self] in self.clock },
            emit: { [unowned self] in self.events.append($0) },
            log: { [unowned self] in self.logs.append($0) }
        )
    }

    // MARK: - Helpers

    private func request(
        _ id: String,
        length: Int64? = 1_000,
        direction: String = "upload",
        method: String = "PUT",
        url: String = "https://bucket.example.com/key?X-Amz-Signature=secret",
        uri: String = "file:///tmp/a.bin",
        title: String? = nil
    ) -> TransferRequest {
        TransferRequest(
            transferId: id,
            direction: direction,
            url: url,
            method: method,
            fileUri: uri,
            contentLength: length,
            title: title
        )
    }

    private func downloadRequest(
        _ id: String,
        method: String = "GET",
        uri: String = "",
        fileName: String? = "photo.png",
        url: String = "https://bucket.example.com/key?X-Amz-Signature=secret"
    ) -> TransferRequest {
        TransferRequest(
            transferId: id,
            direction: "download",
            url: url,
            method: method,
            fileUri: uri,
            contentLength: nil,
            fileName: fileName
        )
    }

    private func startDownload(_ id: String) {
        XCTAssertNoThrow(try core.start(downloadRequest(id)))
    }

    private let downloaded = DownloadedFile(
        uri: "file:///var/mobile/Library/Caches/transfer-download/x/photo.png",
        size: 42,
        contentType: "image/png"
    )

    private static let png: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]

    private func start(_ id: String, length: Int64 = 1_000, title: String? = nil) {
        XCTAssertNoThrow(try core.start(request(id, length: length, title: title)))
    }

    private func assertInvalid(_ block: () throws -> Void, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try block(), file: file, line: line) { error in
            XCTAssertEqual((error as? TransferError)?.code, .invalid, file: file, line: line)
        }
    }

    private func terminalEvents(_ id: String) -> [TransferSnapshot] {
        events.filter { $0.transferId == id && $0.state.isTerminal }
    }

    // MARK: - U1 to U24

    func test_U1_start_emitsFirstRunningEventImmediately() {
        start("a", length: 500)

        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].transferId, "a")
        XCTAssertEqual(events[0].state, .running)
        XCTAssertEqual(events[0].transferredBytes, 0)
        XCTAssertEqual(events[0].totalBytes, 500)
        XCTAssertEqual(events[0].direction, .upload)
    }

    func test_U2_inputAfterTerminal_isIgnored() {
        start("a")
        core.response("a", status: 200, body: nil)
        let countAfterTerminal = events.count

        clock += 1_000
        core.progress("a", bytes: 900)
        core.response("a", status: 500, body: nil)
        core.failure("a", code: .network, message: "late")

        XCTAssertEqual(events.count, countAfterTerminal)
        XCTAssertEqual(core.list().first?.state, .responded)
        XCTAssertEqual(core.list().first?.httpStatus, 200)
        XCTAssertEqual(core.list().first?.transferredBytes, 0)
    }

    func test_U3_cancelAndResponseRace_yieldOneTerminal() {
        // Cancel first: the late response is ignored.
        start("a")
        XCTAssertNoThrow(try core.cancel("a"))
        core.response("a", status: 200, body: nil)
        XCTAssertEqual(terminalEvents("a").map(\.state), [.cancelled])

        // Response first: the late cancel is rejected.
        start("b")
        core.response("b", status: 200, body: nil)
        assertInvalid { try self.core.cancel("b") }
        XCTAssertEqual(terminalEvents("b").map(\.state), [.responded])
    }

    func test_U4_terminalResult_staysInListUntilAck() {
        start("a")
        core.response("a", status: 200, body: nil)
        XCTAssertEqual(core.list().map(\.transferId), ["a"])

        XCTAssertEqual(core.ack(["a"]), 0)
        XCTAssertTrue(core.list().isEmpty)
    }

    func test_U5_ackOnRunning_isIgnored() {
        start("a")

        XCTAssertEqual(core.ack(["a", "unknown"]), 1)
        XCTAssertEqual(core.list().map(\.state), [.running])
    }

    func test_U6_retentionCap_dropsOldestTerminal() {
        for index in 0...TransferCore.retentionCap {
            start("t\(index)")
            core.response("t\(index)", status: 200, body: nil)
        }

        let ids = core.list().map(\.transferId)
        XCTAssertEqual(ids.count, TransferCore.retentionCap)
        XCTAssertFalse(ids.contains("t0"))
        XCTAssertEqual(ids.first, "t1")
        XCTAssertEqual(ids.last, "t100")
        XCTAssertEqual(logs.count, 1)
        XCTAssertTrue(logs[0].contains("t0"))
        XCTAssertFalse(logs[0].contains("://"))
    }

    func test_U7_duplicateId_isInvalid() {
        start("a")
        assertInvalid { try self.core.start(self.request("a")) }

        // Still held after it ended, until acknowledged.
        core.response("a", status: 200, body: nil)
        assertInvalid { try self.core.start(self.request("a")) }

        _ = core.ack(["a"])
        XCTAssertNoThrow(try core.start(request("a")))
    }

    func test_U8_directionAndMethod_downloadGetAccepted_mismatchesAndDownloadFileUriInvalid() {
        startDownload("ok")
        XCTAssertEqual(events.last?.direction, .download)
        XCTAssertEqual(events.last?.totalBytes, 0, "the length is learned from the response")

        assertInvalid { try self.core.start(self.downloadRequest("put", method: "PUT")) }
        assertInvalid { try self.core.start(self.request("get", method: "GET")) }
        assertInvalid { try self.core.start(self.downloadRequest("uri", uri: "file:///var/mobile/Library/app.sqlite")) }
        XCTAssertEqual(core.list().map(\.transferId), ["ok"])
    }

    func test_U9_progressThrottle_terminalImmediate_noEventWithoutIncrease() {
        start("a", length: 1_000)
        XCTAssertEqual(events.count, 1)

        clock += 100
        core.progress("a", bytes: 100)
        XCTAssertEqual(events.count, 1, "within 200 ms of the start event: stored silently")

        clock += 100
        core.progress("a", bytes: 200)
        XCTAssertEqual(events.count, 2, "200 ms after the last event: emitted")
        XCTAssertEqual(events.last?.transferredBytes, 200)

        clock += 500
        core.progress("a", bytes: 200)
        core.progress("a", bytes: 150)
        XCTAssertEqual(events.count, 2, "no increase: nothing emitted")

        clock += 50
        core.progress("a", bytes: 300)
        XCTAssertEqual(events.count, 3, "the silent calls did not reset the throttle window")

        clock += 10
        core.progress("a", bytes: 400)
        XCTAssertEqual(events.count, 3)

        clock += 1
        core.response("a", status: 200, body: nil)
        XCTAssertEqual(events.count, 4, "terminal is never throttled")
        XCTAssertEqual(events.last?.state, .responded)
        XCTAssertEqual(events.last?.transferredBytes, 400, "terminal carries the latest stored bytes")
    }

    func test_U10_batchAggregate_isByteWeighted_andIndeterminateWithUnknownTotal() {
        for index in 0..<9 {
            start("small\(index)", length: 10 * 1_024)
        }
        start("large", length: 4 * 1_024 * 1_024)
        for index in 0..<9 {
            core.response("small\(index)", status: 200, body: nil)
        }

        let aggregate = core.batchAggregate()
        XCTAssertEqual(aggregate?.memberCount, 10)
        XCTAssertEqual(aggregate?.runningCount, 1)
        XCTAssertEqual(aggregate?.ratio ?? -1, 0.0215, accuracy: 0.0001)

        start("unknown", length: 0)
        XCTAssertNil(core.batchAggregate()?.ratio)
    }

    func test_U11_headerFilter_removesPlatformOwnedHeadersCaseInsensitively() {
        let filtered = TransferText.filterHeaders([
            "Content-Length": "10",
            "HOST": "bucket.example.com",
            "content-type": "image/jpeg",
            "x-amz-meta-Name": "Keep Case",
        ])

        XCTAssertEqual(filtered, ["content-type": "image/jpeg", "x-amz-meta-Name": "Keep Case"])
    }

    func test_U12_anyHttpStatus_isResponded() {
        for status in [200, 403, 412] {
            let id = "s\(status)"
            start(id)
            core.response(id, status: status, body: nil)

            let terminal = terminalEvents(id)
            XCTAssertEqual(terminal.count, 1)
            XCTAssertEqual(terminal.first?.state, .responded)
            XCTAssertEqual(terminal.first?.httpStatus, status)
            XCTAssertNil(terminal.first?.errorCode)
        }
    }

    func test_U13_providerCode_fromS3ErrorXml_absentForNonXml() {
        let xml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <Error><Code>SignatureDoesNotMatch</Code><Message>The request signature</Message></Error>
        """
        start("xml")
        core.response("xml", status: 403, body: Data(xml.utf8))
        XCTAssertEqual(terminalEvents("xml").first?.providerCode, "SignatureDoesNotMatch")

        start("text")
        core.response("text", status: 500, body: Data("Internal Server Error".utf8))
        XCTAssertNil(terminalEvents("text").first?.providerCode)

        // Below 300 the body is not an error document, even if it looks like one.
        start("ok")
        core.response("ok", status: 200, body: Data(xml.utf8))
        XCTAssertNil(terminalEvents("ok").first?.providerCode)
    }

    func test_U14_errorMessage_urlReplaced_truncatedOnCharacterBoundary() {
        start("url")
        core.failure("url", code: .network, message: "failed https://bucket.example.com/k?sig=abc now")
        XCTAssertEqual(terminalEvents("url").first?.errorMessage, "failed [url] now")
        XCTAssertEqual(terminalEvents("url").first?.errorCode, .network)

        // 67 three-byte characters are 201 bytes: the last one must go whole, not half.
        let long = String(repeating: "\u{AC00}", count: 67)
        start("long")
        core.failure("long", code: .network, message: long)
        let message = terminalEvents("long").first?.errorMessage ?? ""
        XCTAssertEqual(message.utf8.count, 198)
        XCTAssertEqual(message, String(repeating: "\u{AC00}", count: 66))
    }

    func test_U15_continuedTaskExpiry_cancelsEveryRunningTransfer_leavesTerminalOnes() {
        start("done")
        core.response("done", status: 200, body: nil)
        start("a")
        start("b")

        let stopped = core.continuedTaskExpired()

        XCTAssertEqual(stopped, ["a", "b"])
        XCTAssertEqual(terminalEvents("a").map(\.state), [.cancelled])
        XCTAssertEqual(terminalEvents("b").map(\.state), [.cancelled])
        XCTAssertEqual(terminalEvents("done").map(\.state), [.responded])
        XCTAssertEqual(core.runningCount, 0)
    }

    func test_U16_stall_closesTaskWithoutCancelling_progressResetsTimer() {
        start("a", length: 1_000)

        clock += 29_999
        XCTAssertFalse(core.shouldCloseContinuedTask(now: clock))
        core.progress("a", bytes: 10)

        clock += 29_999
        XCTAssertFalse(core.shouldCloseContinuedTask(now: clock), "progress restarted the 30 s window")

        clock += 1
        XCTAssertTrue(core.shouldCloseContinuedTask(now: clock))
        XCTAssertTrue(core.isRunning("a"), "closing the UI never cancels the transfer")
        XCTAssertTrue(terminalEvents("a").isEmpty)
    }

    func test_U17_commit_only2xxKeepsTheBody_everyOtherStatusLeavesNoFile() {
        for status in [200, 204, 299] { XCTAssertTrue(DownloadFiles.keepsBody(status), "\(status)") }
        for status in [199, 301, 403, 404, 500] { XCTAssertFalse(DownloadFiles.keepsBody(status), "\(status)") }

        startDownload("ok")
        core.response("ok", status: 200, body: nil, file: downloaded)
        XCTAssertEqual(terminalEvents("ok").first?.file, downloaded)

        let xml = Data("<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>".utf8)
        for status in [301, 403, 404, 500] {
            startDownload("d\(status)")
            // Even if a file were reported, a non-2xx answer keeps none: an error document must never
            // reach the photo library under an image's name.
            core.response("d\(status)", status: status, body: xml, file: downloaded)
            XCTAssertEqual(terminalEvents("d\(status)").first?.state, .responded)
            XCTAssertNil(terminalEvents("d\(status)").first?.file, "\(status)")
        }
        XCTAssertEqual(terminalEvents("d403").first?.providerCode, "AccessDenied")

        start("u")
        core.response("u", status: 200, body: nil, file: downloaded)
        XCTAssertNil(terminalEvents("u").first?.file, "an upload never carries a file")
    }

    func test_U18_denominator_fromContentLength_orUnknownWithout() {
        startDownload("known")
        core.expectLength("known", contentLength: 1_234)
        XCTAssertEqual(core.list().first { $0.transferId == "known" }?.totalBytes, 1_234)

        startDownload("chunked")
        core.expectLength("chunked", contentLength: -1)
        XCTAssertEqual(core.list().first { $0.transferId == "chunked" }?.totalBytes, 0)
        clock += 500
        core.progress("chunked", bytes: 900)
        XCTAssertEqual(events.last?.transferredBytes, 900, "unknown total: bytes still count up")

        start("u", length: 100)
        core.expectLength("u", contentLength: 5)
        XCTAssertEqual(core.list().first { $0.transferId == "u" }?.totalBytes, 100, "an upload keeps its declared length")
    }

    func test_U19_exportable_onlyCommittedFilesInsideTheDownloadFolder() throws {
        let fm = FileManager.default
        let base = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: base) }
        let root = base.appendingPathComponent("Caches/\(DownloadFiles.folder)")
        let folder = root.appendingPathComponent("abc")
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let photo = folder.appendingPathComponent("photo.png")
        try Data(Self.png).write(to: photo)
        try Data(Self.png).write(to: folder.appendingPathComponent("a b.png"))
        try Data(Self.png).write(to: folder.appendingPathComponent("next.png.part"))
        let database = base.appendingPathComponent("Library/app.sqlite")
        try fm.createDirectory(at: database.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("secret".utf8).write(to: database)
        let link = folder.appendingPathComponent("link.png")
        try fm.createSymbolicLink(at: link, withDestinationURL: database)
        let otherCache = base.appendingPathComponent("Caches/transfer-temp/upload.png")
        try fm.createDirectory(at: otherCache.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(Self.png).write(to: otherCache)
        func uri(_ path: String) -> String { "file://\(path)" }

        guard case let .accepted(file) = DownloadFiles.checkExportable(uri(photo.path), root: root) else {
            return XCTFail("the committed file is accepted")
        }
        XCTAssertEqual(file.lastPathComponent, "photo.png")
        XCTAssertEqual(try Data(contentsOf: file), Data(Self.png))
        guard case .accepted = DownloadFiles.checkExportable(uri(folder.path + "/a%20b.png"), root: root) else {
            return XCTFail("a percent-encoded name is accepted")
        }

        let refused: [(String, String)] = [
            ("dot-dot escape", uri(folder.path + "/../../../Library/app.sqlite")),
            ("symbolic link escape", uri(link.path)),
            ("another folder", uri(otherCache.path)),
            ("database directly", uri(database.path)),
            ("content scheme", "content://io.chatic.dou.share.fileprovider/transfer-download/abc/photo.png"),
            ("https", "https://bucket.example.com/photo.png"),
            ("relative path", "photo.png"),
            ("file URI with a host", "file://evil" + photo.path),
            ("still receiving", uri(folder.path + "/next.png.part")),
            ("the folder itself", uri(root.path)),
            ("a transfer folder", uri(folder.path)),
            ("a NUL in the path", uri(folder.path + "/a%00b.png")),
        ]
        for (label, value) in refused {
            guard case .invalid = DownloadFiles.checkExportable(value, root: root) else {
                XCTFail("\(label) must be refused")
                continue
            }
        }
        XCTAssertEqual(DownloadFiles.checkExportable(uri(folder.path + "/gone.png"), root: root), .missing)
    }

    func test_U20_sniff_knownImagesByTheirFirstBytes_anythingElseUnsupported() {
        XCTAssertEqual(DownloadFiles.sniffImage(Data(Self.png)), .png)
        XCTAssertEqual(DownloadFiles.sniffImage(Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])), .jpeg)
        XCTAssertEqual(DownloadFiles.sniffImage(Data("GIF87a\u{1}\u{0}\u{1}\u{0}\u{0}\u{0}".utf8)), .gif)
        XCTAssertEqual(DownloadFiles.sniffImage(Data("GIF89a\u{1}\u{0}\u{1}\u{0}\u{0}\u{0}".utf8)), .gif)
        XCTAssertEqual(DownloadFiles.sniffImage(Data("RIFF\u{24}\u{0}\u{0}\u{0}WEBPVP8 ".utf8)), .webp)

        XCTAssertEqual(DownloadFiles.ImageType.jpeg.mimeType, "image/jpeg")
        XCTAssertEqual(DownloadFiles.ImageType.jpeg.fileExtension, "jpg")

        XCTAssertNil(DownloadFiles.sniffImage(Data("<?xml version=\"1.0\"?><Error/>".utf8)), "XML error body")
        XCTAssertNil(DownloadFiles.sniffImage(Data("<!doctype html><html>".utf8)), "HTML")
        XCTAssertNil(DownloadFiles.sniffImage(Data("RIFF\u{24}\u{0}\u{0}\u{0}WAVEfmt ".utf8)), "RIFF but not WebP")
        XCTAssertNil(DownloadFiles.sniffImage(Data()), "empty")
        XCTAssertNil(DownloadFiles.sniffImage(Data(Self.png.prefix(10))), "fewer than 11 bytes")
    }

    func test_U21_names_cleaned_shortened_extensionFromBytes_collisionsNumbered() {
        typealias Parts = DownloadFiles.NameParts
        let emoji = "\u{1F600}"
        let cases: [(String, Parts)] = [
            ("../../etc/passwd", Parts(base: "passwd", ext: nil)),
            ("C:\\Users\\me\\Photo.PNG", Parts(base: "Photo", ext: "png")),
            ("pho\u{0}to\u{1F}\u{7F}\u{85}.jpg", Parts(base: "photo", ext: "jpg")),
            ("a:b*c?\"<>|.png", Parts(base: "a_b_c_____", ext: "png")),
            ("  .hidden.gif. ", Parts(base: "hidden", ext: "gif")),
            (String(repeating: "x", count: 80) + ".gif", Parts(base: String(repeating: "x", count: 60), ext: "gif")),
            (String(repeating: emoji, count: 70), Parts(base: String(repeating: emoji, count: 60), ext: nil)),
            ("archive.tar.gz", Parts(base: "archive.tar", ext: "gz")),
            ("notes.not an ext", Parts(base: "notes.not an ext", ext: nil)),
            ("resume.part", Parts(base: "resume", ext: nil)),
            ("a.part.part", Parts(base: "a", ext: nil)),
            ("photo.png.PART", Parts(base: "photo", ext: "png")),
        ]
        for (hint, parts) in cases {
            XCTAssertEqual(DownloadFiles.nameParts(hint), parts, hint)
            XCTAssertEqual(DownloadFiles.nameParts(DownloadFiles.fileName(parts)), parts, "idempotent: \(hint)")
        }
        for empty in [nil, "", "   ", "...", "/", "\u{0}"] as [String?] {
            XCTAssertEqual(DownloadFiles.nameParts(empty), Parts(base: "image", ext: nil))
        }

        let photo = DownloadFiles.nameParts("photo.png")
        XCTAssertEqual(DownloadFiles.fileName(photo, sniffed: .jpeg), "photo.jpg")
        XCTAssertEqual(DownloadFiles.fileName(DownloadFiles.nameParts("scan.jpeg"), sniffed: .jpeg), "scan.jpg")
        XCTAssertEqual(DownloadFiles.fileName(DownloadFiles.nameParts("report.pdf"), sniffed: nil), "report.pdf")
        XCTAssertEqual(DownloadFiles.fileName(DownloadFiles.nameParts(nil), sniffed: .webp), "image.webp")
        XCTAssertEqual(DownloadFiles.partName(photo), "photo.png.part")

        XCTAssertEqual(DownloadFiles.uniqueName("image.png") { _ in false }, "image.png")
        XCTAssertEqual(DownloadFiles.uniqueName("image.png") { $0 == "image.png" }, "image (1).png")
        XCTAssertEqual(DownloadFiles.uniqueName("image.png") { ["image.png", "image (1).png"].contains($0) }, "image (2).png")
        XCTAssertEqual(DownloadFiles.uniqueName("image") { $0 == "image" }, "image (1)")

        // The folder is a hash of the id, so an id cannot name a path.
        XCTAssertEqual(DownloadFiles.folderName("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertNotNil(DownloadFiles.folderName("../../databases").range(of: "^[0-9a-f]{64}$", options: .regularExpression))
    }

    func test_U22_sweep_onlyFoldersOlderThan24h_neverARunningTransfers() {
        let hour: Int64 = 60 * 60 * 1000
        let now = 100 * 24 * hour
        let folders = [
            DownloadFiles.FolderAge(name: "old", modifiedAtMs: now - 24 * hour - 1),
            DownloadFiles.FolderAge(name: "exactly-a-day", modifiedAtMs: now - 24 * hour),
            DownloadFiles.FolderAge(name: "fresh", modifiedAtMs: now - hour),
            DownloadFiles.FolderAge(name: "running", modifiedAtMs: now - 48 * hour),
        ]
        XCTAssertEqual(DownloadFiles.foldersToSweep(folders, nowMs: now, runningFolderNames: ["running"]), ["old"])

        startDownload("r")
        start("u")
        startDownload("done")
        core.response("done", status: 200, body: nil, file: downloaded)
        XCTAssertEqual(core.runningDownloads(), ["r"])
    }

    func test_U23_systemSurfaces_downloadOnlyBatch_noProgressTaskNoFailureNotice() {
        startDownload("d1")
        XCTAssertFalse(core.shouldStartContinuedTask())
        core.failure("d1", code: .network, message: "reset")
        XCTAssertNil(core.batchFailureNotice())
        XCTAssertNil(core.batchAggregate(), "a download never joins the batch")

        // Mixed: the upload decides, and the notice counts uploads only.
        start("u1")
        startDownload("d2")
        XCTAssertTrue(core.shouldStartContinuedTask())
        core.failure("u1", code: .network, message: "reset")
        core.failure("d2", code: .network, message: "reset")
        let notice = core.batchFailureNotice()
        XCTAssertEqual(notice?.failedCount, 1)
        XCTAssertEqual(notice?.memberCount, 1)

        // The task's expiry cancels the uploads it covered and leaves a download running.
        start("u3")
        startDownload("d3")
        XCTAssertEqual(core.continuedTaskExpired(), ["u3"])
        XCTAssertTrue(core.isRunning("d3"))
        XCTAssertEqual(core.runningUploadCount, 0)
        XCTAssertFalse(core.shouldStartContinuedTask(), "nothing left for the task to show")
        XCTAssertFalse(core.shouldCloseContinuedTask(now: .max))
    }

    func test_U24_requestHeaders_downloadAsksForIdentity_overridingTheCaller_uploadUntouched() {
        let headers = [
            "ACCEPT-ENCODING": "gzip",
            "Host": "bucket.example.com",
            "content-length": "12",
            "x-amz-date": "20260930T000000Z",
        ]
        XCTAssertEqual(
            TransferText.downloadHeaders(headers),
            ["x-amz-date": "20260930T000000Z", "Accept-Encoding": "identity"]
        )
        XCTAssertFalse(TransferText.requestHeaders([:], contentType: "image/png").keys.contains { $0.lowercased() == "accept-encoding" })
    }

    // MARK: - restore

    func test_restore_reRegistersRunningTransfer_andJoinsBatch() {
        XCTAssertTrue(core.restore(transferId: "r", direction: .upload, totalBytes: 1_000, transferredBytes: 400))

        XCTAssertEqual(events.last?.state, .running)
        XCTAssertEqual(events.last?.transferredBytes, 400)
        XCTAssertEqual(core.list().map(\.transferId), ["r"])
        XCTAssertEqual(core.batchAggregate()?.ratio ?? -1, 0.4, accuracy: 0.0001)

        // A second restore of a held id changes nothing.
        XCTAssertFalse(core.restore(transferId: "r", direction: .upload, totalBytes: 1_000, transferredBytes: 0))
        XCTAssertEqual(core.list().first?.transferredBytes, 400)

        // It behaves like any other transfer afterwards, and blocks reuse of its id.
        assertInvalid { try self.core.start(self.request("r")) }
        core.response("r", status: 200, body: nil)
        XCTAssertEqual(terminalEvents("r").map(\.state), [.responded])
    }

    func test_restore_clampsBytes_andTreatsUnknownTotalAsZero() {
        XCTAssertTrue(core.restore(transferId: "over", direction: .upload, totalBytes: 100, transferredBytes: 500))
        XCTAssertEqual(core.list().first?.transferredBytes, 100)

        // URLSession reports -1 when it does not know the size.
        XCTAssertTrue(core.restore(transferId: "unknown", direction: .upload, totalBytes: -1, transferredBytes: 50))
        let unknown = core.list().first { $0.transferId == "unknown" }
        XCTAssertEqual(unknown?.totalBytes, 0)
        XCTAssertEqual(unknown?.transferredBytes, 50)

        XCTAssertFalse(core.restore(transferId: "", direction: .upload, totalBytes: 10, transferredBytes: 0))
    }

    // MARK: - Remaining branches

    func test_validate_rejectsEveryMalformedRequest() {
        assertInvalid { try self.core.start(self.request("")) }
        assertInvalid { try self.core.start(self.request("  ")) }
        assertInvalid { try self.core.start(self.request("a", direction: "sideways")) }
        assertInvalid { try self.core.start(self.request("a", method: "POST")) }
        assertInvalid { try self.core.start(self.request("a", uri: "")) }
        assertInvalid { try self.core.start(self.request("a", length: nil)) }
        assertInvalid { try self.core.start(self.request("a", length: -1)) }
        XCTAssertTrue(events.isEmpty)

        XCTAssertNoThrow(try core.start(request("zero", length: 0)), "an empty file is a valid upload")
    }

    func test_validate_rejectsAUrlThatIsNotAnAbsoluteHttpUrl() {
        // A distinct id per case, so a duplicate id can never be what rejects it.
        assertInvalid { try self.core.start(self.request("empty", url: "")) }
        assertInvalid { try self.core.start(self.request("file", url: "file:///tmp/a.bin")) }
        assertInvalid { try self.core.start(self.request("text", url: "not a url")) }
        assertInvalid { try self.core.start(self.request("hostless", url: "https:///no-host")) }
        XCTAssertTrue(events.isEmpty)

        XCTAssertNoThrow(try core.start(request("empty", url: "HTTP://localhost:8080/s3/ok")), "nothing was registered, so the id is still free")
    }

    func test_localFileURL_acceptsAFileUriOrAnAbsolutePath_only() {
        XCTAssertEqual(TransferText.localFileURL("file:///tmp/a.bin")?.path, "/tmp/a.bin")
        XCTAssertEqual(TransferText.localFileURL("/var/mobile/a b.jpg")?.path, "/var/mobile/a b.jpg")
        XCTAssertEqual(TransferText.localFileURL("file:///tmp/a%20b.jpg")?.path, "/tmp/a b.jpg")
        XCTAssertNil(TransferText.localFileURL("content://media/external/1"))
        XCTAssertNil(TransferText.localFileURL("https://example.com/a.bin"))
        XCTAssertNil(TransferText.localFileURL("relative/a.bin"))
    }

    func test_progress_clampsToTotal_isMonotonic_andIgnoresUnknownIds() {
        start("a", length: 100)
        clock += 300
        core.progress("a", bytes: 5_000)
        XCTAssertEqual(events.last?.transferredBytes, 100)

        clock += 300
        core.progress("unknown", bytes: 10)
        XCTAssertEqual(events.count, 2)

        start("zero", length: 0)
        clock += 300
        core.progress("zero", bytes: 70)
        XCTAssertEqual(events.last?.transferredBytes, 70, "unknown total: monotonic only")
    }

    func test_failure_andCancel_onUnknownIds() {
        core.failure("ghost", code: .network, message: "x")
        core.response("ghost", status: 200, body: nil)
        XCTAssertTrue(events.isEmpty)
        assertInvalid { try self.core.cancel("ghost") }
    }

    func test_cancel_isTerminalCancelled_andHeldUntilAck() {
        start("a")
        XCTAssertNoThrow(try core.cancel("a"))

        XCTAssertEqual(events.last?.state, .cancelled)
        XCTAssertNil(events.last?.errorCode)
        XCTAssertEqual(core.list().map(\.state), [.cancelled])
        assertInvalid { try self.core.cancel("a") }
    }

    func test_failAllRunning_failsRunningOnly_withGivenCode() {
        start("done")
        core.response("done", status: 200, body: nil)
        start("a")
        start("b")

        XCTAssertEqual(core.failAllRunning(code: .system), ["a", "b"])
        XCTAssertEqual(terminalEvents("a").first?.errorCode, .system)
        XCTAssertEqual(terminalEvents("b").first?.state, .failed)
        XCTAssertEqual(terminalEvents("done").map(\.state), [.responded])
        XCTAssertTrue(core.failAllRunning(code: .system).isEmpty)
    }

    func test_stall_isFalseWithNothingRunning_andCountsFromBatchStart() {
        XCTAssertFalse(core.shouldCloseContinuedTask(now: clock + 60_000))

        start("a")
        XCTAssertTrue(core.shouldCloseContinuedTask(now: clock + 30_000), "no progress yet: measured from batch start")

        core.response("a", status: 200, body: nil)
        XCTAssertFalse(core.shouldCloseContinuedTask(now: clock + 60_000))
    }

    func test_batch_startsFreshWhenNothingRuns_joinsWhileRunning_andReportsFailure() {
        XCTAssertNil(core.batchAggregate())

        start("a", length: 100, title: "photo.jpg")
        XCTAssertEqual(core.batchAggregate()?.singleTitle, "photo.jpg")
        start("b", length: 300)
        XCTAssertEqual(core.batchAggregate()?.memberCount, 2, "joined while a runs")
        XCTAssertNil(core.batchAggregate()?.singleTitle)

        core.failure("a", code: .network, message: "offline")
        XCTAssertEqual(core.batchAggregate()?.anyFailed, true)
        _ = core.ack(["a"])
        XCTAssertEqual(core.batchAggregate()?.countedBytes, 100, "an acknowledged member still counts as settled")

        core.response("b", status: 200, body: nil)
        XCTAssertEqual(core.batchAggregate()?.ratio, 1.0)

        start("c", length: 50)
        let fresh = core.batchAggregate()
        XCTAssertEqual(fresh?.memberCount, 1, "nothing was running, so a new batch began")
        XCTAssertEqual(fresh?.anyFailed, false)
    }

    func test_batchFailureNotice_onlyForAFinishedBatchWithAFailure() {
        XCTAssertNil(core.batchFailureNotice(), "no batch yet")

        start("ok")
        core.response("ok", status: 200, body: nil)
        XCTAssertNil(core.batchFailureNotice(), "a batch that only succeeded announces nothing")

        start("a", title: "photo.jpg")
        start("b")
        start("c")
        core.failure("a", code: .network, message: "offline")
        core.failure("b", code: .network, message: "offline")
        XCTAssertNil(core.batchFailureNotice(), "not while c still runs")

        core.response("c", status: 403, body: nil)
        let notice = core.batchFailureNotice()
        XCTAssertEqual(notice?.failedCount, 2)
        XCTAssertEqual(notice?.memberCount, 3)
        XCTAssertNil(notice?.singleTitle)
        _ = core.ack(["a", "b", "c"])
        XCTAssertEqual(core.batchFailureNotice(), notice, "the same batch keeps the same notice after ack")

        start("d", title: "clip.mov")
        core.failure("d", code: .network, message: "offline")
        let next = core.batchFailureNotice()
        XCTAssertNotEqual(next?.batchSequence, notice?.batchSequence)
        XCTAssertEqual(next?.singleTitle, "clip.mov")

        start("e")
        XCTAssertNoThrow(try core.cancel("e"))
        XCTAssertNil(core.batchFailureNotice(), "a cancellation is not a failure")
    }

    func test_list_isInStartOrder() {
        start("first")
        start("second")
        start("third")
        core.response("second", status: 200, body: nil)

        XCTAssertEqual(core.list().map(\.transferId), ["first", "second", "third"])
    }

    func test_snapshotDictionary_omitsAbsentFields() {
        start("a", length: 10)
        let running = events[0].dictionary
        XCTAssertEqual(Set(running.keys), ["transferId", "direction", "state", "transferredBytes", "totalBytes"])

        core.response("a", status: 403, body: Data("<Code>AccessDenied</Code>".utf8))
        let responded = events.last!.dictionary
        XCTAssertEqual(responded["state"] as? String, "responded")
        XCTAssertEqual(responded["httpStatus"] as? Int, 403)
        XCTAssertEqual(responded["providerCode"] as? String, "AccessDenied")
        XCTAssertNil(responded["errorCode"])
        XCTAssertNil(responded["title"], "title is for notifications only, never the bridge")
    }

    func test_requestDictionary_parsesBridgePayload() {
        let parsed = TransferRequest(dictionary: [
            "transferId": "a",
            "direction": "upload",
            "url": "https://bucket.example.com/k",
            "method": "PUT",
            "headers": ["content-type": "image/png", "x-amz-meta-size": NSNumber(value: 42)],
            "file": ["uri": "file:///tmp/a.png", "contentType": "image/png", "contentLength": NSNumber(value: 42)],
            "title": "a.png",
        ])

        XCTAssertEqual(parsed.transferId, "a")
        XCTAssertEqual(parsed.headers, ["content-type": "image/png", "x-amz-meta-size": "42"])
        XCTAssertEqual(parsed.fileUri, "file:///tmp/a.png")
        XCTAssertEqual(parsed.contentLength, 42)
        XCTAssertEqual(parsed.title, "a.png")
        XCTAssertNoThrow(try core.validate(parsed))

        let empty = TransferRequest(dictionary: [:])
        XCTAssertNil(empty.contentLength)
        assertInvalid { try self.core.validate(empty) }
    }

    func test_sanitize_leavesShortMessagesWithoutUrlsAlone() {
        XCTAssertEqual(TransferText.sanitize("The network connection was lost."), "The network connection was lost.")
        XCTAssertEqual(TransferText.sanitize("a ftp://x b s3://bucket/key"), "a [url] b [url]")
    }

    func test_requestHeaders_defaultContentTypeOnlyWhenCallerGaveNone() {
        XCTAssertEqual(
            TransferText.requestHeaders(["Content-Length": "3", "x-amz-acl": "private"], contentType: "image/jpeg"),
            ["x-amz-acl": "private", "Content-Type": "image/jpeg"]
        )
        XCTAssertEqual(
            TransferText.requestHeaders([:], contentType: nil),
            ["Content-Type": "application/octet-stream"]
        )
        XCTAssertEqual(
            TransferText.requestHeaders([:], contentType: "  "),
            ["Content-Type": "application/octet-stream"]
        )
        // The caller's own header wins, whatever its case, and is never duplicated.
        XCTAssertEqual(
            TransferText.requestHeaders(["content-TYPE": "image/png"], contentType: "image/jpeg"),
            ["content-TYPE": "image/png"]
        )
    }

    func test_checkSourceLength_rejectsMismatchAsSource() {
        XCTAssertNoThrow(try TransferCore.checkSourceLength(actual: 42, declared: 42))
        XCTAssertNoThrow(try TransferCore.checkSourceLength(actual: 0, declared: 0))
        XCTAssertThrowsError(try TransferCore.checkSourceLength(actual: 41, declared: 42)) { error in
            XCTAssertEqual((error as? TransferError)?.code, .source)
        }
    }

    func test_sentBytesAtCompletion_trustsCounters_andFallsBackToTheFractionOnlyWhenBothAreEmpty() {
        // Counters report the body: taken as they are, even when the fraction lags at 0.
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 1_048_576, countExpected: 1_048_576, fraction: 0, declared: 1_048_576), 1_048_576)
        // Both counters empty, progress complete: the case seen from a real background session.
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 0, countExpected: 0, fraction: 1, declared: 1_048_576), 1_048_576)
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 0, countExpected: 0, fraction: 0.5, declared: 1_001), 500)
        // A counter that is known and zero stays zero; nothing to fall back to stays zero.
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 0, countExpected: 1_000, fraction: 1, declared: 1_000), 0)
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 0, countExpected: 0, fraction: 1, declared: 0), 0)
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 0, countExpected: 0, fraction: .nan, declared: 10), 0)
        XCTAssertEqual(TransferCore.sentBytesAtCompletion(countSent: 0, countExpected: 0, fraction: 3, declared: 10), 10)
    }

    func test_declaredBytes_isTheStartLength_orZeroWhenUnknown() {
        start("a", length: 4_096)
        XCTAssertEqual(core.declaredBytes("a"), 4_096)
        XCTAssertEqual(core.declaredBytes("ghost"), 0)
    }

    func test_progress_equalToStoredThrottledValue_emitsNothing() {
        start("a", length: 1_000)
        clock += 50
        core.progress("a", bytes: 300)
        XCTAssertEqual(events.count, 1, "throttled: stored silently")

        clock += 500
        core.progress("a", bytes: 300)
        XCTAssertEqual(events.count, 1, "compared with the stored value, not the last emitted one")

        core.response("a", status: 200, body: nil)
        XCTAssertEqual(events.last?.transferredBytes, 300)
    }

    func test_download_validate_rejectsABadUrlOrMethod_treatsABlankFileUriAsAbsent() {
        assertInvalid { try self.core.start(self.downloadRequest("file", url: "file:///var/app.sqlite")) }
        assertInvalid { try self.core.start(self.downloadRequest("hostless", url: "https:///no-host")) }
        assertInvalid { try self.core.start(self.downloadRequest("method", method: "")) }
        XCTAssertNoThrow(try core.start(downloadRequest("blank", uri: "  ", fileName: nil)))
        XCTAssertEqual(core.list().map(\.transferId), ["blank"])
    }

    func test_download_progressIsClampedOnceTheLengthIsKnown_andTheFileIsHeldUntilAck() {
        startDownload("d")
        core.expectLength("d", contentLength: 100)
        clock += 500
        core.progress("d", bytes: 250)
        XCTAssertEqual(events.last?.transferredBytes, 100)

        core.response("d", status: 200, body: nil, file: downloaded)
        XCTAssertEqual(core.list().first?.file, downloaded)
        XCTAssertEqual((core.list().first?.dictionary["file"] as? [String: Any])?["uri"] as? String, downloaded.uri)
        _ = core.ack(["d"])
        XCTAssertTrue(core.list().isEmpty)
    }

    func test_expectLength_afterTheEnd_orForAnUnknownId_isIgnored() {
        startDownload("d")
        core.failure("d", code: .network, message: "reset")
        core.expectLength("d", contentLength: 100)
        core.expectLength("nobody", contentLength: 100)
        XCTAssertEqual(core.list().first?.totalBytes, 0)
    }

    func test_requestDictionary_readsTheDownloadNameHint() {
        let parsed = TransferRequest(dictionary: [
            "transferId": "d",
            "direction": "download",
            "url": "https://bucket.example.com/k",
            "method": "GET",
            "file": ["name": "photo.png"],
        ])
        XCTAssertEqual(parsed.fileName, "photo.png")
        XCTAssertEqual(parsed.fileUri, "")
    }

    func test_providerCode_emptyOrMissingBody() {
        XCTAssertNil(TransferText.providerCode(from: nil))
        XCTAssertNil(TransferText.providerCode(from: Data()))
        XCTAssertNil(TransferText.providerCode(from: Data("<Code></Code>".utf8)))
    }
}
