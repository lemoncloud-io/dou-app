import XCTest

/// The core rules both platforms promise. U1 to U16 carry the same numbers as the Android suite;
/// the tests after them cover the remaining branches of this implementation.
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

    // MARK: - U1 to U16

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

    func test_U8_download_isInvalid() {
        assertInvalid { try self.core.start(self.request("a", direction: "download", method: "GET")) }
        XCTAssertTrue(events.isEmpty)
        XCTAssertTrue(core.list().isEmpty)
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

    func test_providerCode_emptyOrMissingBody() {
        XCTAssertNil(TransferText.providerCode(from: nil))
        XCTAssertNil(TransferText.providerCode(from: Data()))
        XCTAssertNil(TransferText.providerCode(from: Data("<Code></Code>".utf8)))
    }
}
