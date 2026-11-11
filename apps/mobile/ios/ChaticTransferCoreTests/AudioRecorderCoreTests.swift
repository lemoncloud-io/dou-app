import XCTest

/// The voice-recorder rules that need no UIKit or AVFoundation.
/// `Bridges/AudioRecorder/Core/AudioRecorderCore.swift` reaches this bundle as an explicit file
/// reference, like the attachment picker's core does.
final class AudioRecorderCoreTests: XCTestCase {
    private typealias Core = AudioRecorderCore

    // MARK: - Limit

    func testMaxDuration_keepsALimitWithinFiveMinutes() {
        XCTAssertEqual(Core.clampedMaxDurationMs(60_000), 60_000)
        XCTAssertEqual(Core.clampedMaxDurationMs(300_000), 300_000, "exactly five minutes")
        XCTAssertEqual(Core.clampedMaxDurationMs(1), 1)
        XCTAssertEqual(Core.clampedMaxDurationMs(1500.7), 1500, "a fraction of a millisecond is dropped")
        XCTAssertEqual(Core.clampedMaxDurationMs(0.5), 1, "never a zero limit")
    }

    func testMaxDuration_anythingElseMeansFiveMinutes() {
        for requested in [nil, 0, -1, 300_001, 1e12, .infinity, -.infinity, .nan] as [Double?] {
            XCTAssertEqual(Core.clampedMaxDurationMs(requested), 300_000, String(describing: requested))
        }
    }

    // MARK: - End

    func testStopAction_onlySendOrCancel() {
        XCTAssertEqual(Core.StopAction(rawValue: "send"), .send)
        XCTAssertEqual(Core.StopAction(rawValue: "cancel"), .cancel)
        for raw in ["", "SEND", "stop", "discard"] {
            XCTAssertNil(Core.StopAction(rawValue: raw), raw)
        }
    }

    func testEndReason_sendKeepsFromOneSecond_cancelAlwaysDiscards() {
        XCTAssertEqual(Core.endReason(for: .send, elapsedMs: 1000), .sent)
        XCTAssertEqual(Core.endReason(for: .send, elapsedMs: 120_000), .sent)
        XCTAssertEqual(Core.endReason(for: .send, elapsedMs: 999), .tooShort)
        XCTAssertEqual(Core.endReason(for: .send, elapsedMs: 0), .tooShort)
        XCTAssertEqual(Core.endReason(for: .cancel, elapsedMs: 0), .cancelled)
        XCTAssertEqual(Core.endReason(for: .cancel, elapsedMs: 120_000), .cancelled)
    }

    func testEndReason_wireNames_andWhichKeepTheFile() {
        let reasons: [(Core.EndReason, String, Bool)] = [
            (.sent, "SENT", true),
            (.maxDuration, "MAX_DURATION", true),
            (.cancelled, "CANCELLED", false),
            (.tooShort, "TOO_SHORT", false),
            (.interrupted, "INTERRUPTED", false),
            (.failed, "INTERNAL", false),
        ]
        for (reason, wire, keeps) in reasons {
            XCTAssertEqual(reason.rawValue, wire)
            XCTAssertEqual(reason.keepsFile, keeps, wire)
        }
    }

    func testFinishedReason_theLimit_anEarlierCleanStop_orAFailure() {
        XCTAssertEqual(Core.finishedReason(successfully: true, elapsedMs: 60_000, maxDurationMs: 60_000), .maxDuration)
        XCTAssertEqual(Core.finishedReason(successfully: true, elapsedMs: 60_120, maxDurationMs: 60_000), .maxDuration, "the callback lands late")
        XCTAssertEqual(Core.finishedReason(successfully: true, elapsedMs: 59_500, maxDurationMs: 60_000), .maxDuration, "within the slack")
        XCTAssertEqual(Core.finishedReason(successfully: true, elapsedMs: 59_499, maxDurationMs: 60_000), .interrupted, "the system stopped it early")
        XCTAssertEqual(Core.finishedReason(successfully: true, elapsedMs: 3000, maxDurationMs: 300_000), .interrupted)
        XCTAssertEqual(Core.finishedReason(successfully: false, elapsedMs: 60_000, maxDurationMs: 60_000), .failed)
        XCTAssertEqual(Core.finishedReason(successfully: false, elapsedMs: 10, maxDurationMs: 60_000), .failed)
    }

    func testDurationMs_whatWasRecorded_elseTheElapsedTime_neverPastTheLimit() {
        XCTAssertEqual(Core.durationMs(recordedSeconds: 12.3456, elapsedMs: 12_400, maxDurationMs: 300_000), 12_346)
        XCTAssertEqual(Core.durationMs(recordedSeconds: 0, elapsedMs: 4200, maxDurationMs: 300_000), 4200, "the recorder said nothing")
        XCTAssertEqual(Core.durationMs(recordedSeconds: .nan, elapsedMs: 4200, maxDurationMs: 300_000), 4200)
        XCTAssertEqual(Core.durationMs(recordedSeconds: 61, elapsedMs: 61_000, maxDurationMs: 60_000), 60_000)
        XCTAssertEqual(Core.durationMs(recordedSeconds: 0, elapsedMs: -5, maxDurationMs: 60_000), 0)
    }

    // MARK: - File

    func testFileName_isVoiceAndTheLocalStartTime() throws {
        // 2026-11-02 05:25:30 UTC, which is 14:25:30 in Seoul.
        let startedAt = Date(timeIntervalSince1970: 1_793_597_130)
        let seoul = try XCTUnwrap(TimeZone(identifier: "Asia/Seoul"))
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        XCTAssertEqual(Core.fileName(startedAt: startedAt, timeZone: seoul), "voice-20261102-142530.m4a")
        XCTAssertEqual(Core.fileName(startedAt: startedAt, timeZone: utc), "voice-20261102-052530.m4a")
    }

    func testRecordingFile_isAPickFolderOfItsOwn_soTheTransferAndTheSweepTakeIt() throws {
        let root = URL(fileURLWithPath: "/var/mobile/Containers/Data/Application/X/Library/Caches/attach-pick", isDirectory: true)
        let id = try XCTUnwrap(UUID(uuidString: "0B8E3C5A-7D2F-4E61-9A4B-1C2D3E4F5A6B"))
        let file = Core.recordingFile(root: root, folderId: id, name: "voice-20261102-142530.m4a")
        XCTAssertEqual(file.path, "\(root.path)/0B8E3C5A-7D2F-4E61-9A4B-1C2D3E4F5A6B/voice-20261102-142530.m4a")
        XCTAssertTrue(AttachmentPickerCore.isInPickFolder(file.path), "where the picker keeps a picked file")
        XCTAssertEqual(root.lastPathComponent, AttachmentPickerCore.folder)
    }

    func testIsMpeg4_bytesFourToSevenAreFtyp() {
        XCTAssertTrue(Core.isMpeg4(Data([0, 0, 0, 0x1C] + Array("ftypM4A ".utf8))))
        XCTAssertTrue(Core.isMpeg4(Data([0, 0, 0, 0x18] + Array("ftypisom".utf8))))
        XCTAssertTrue(Core.isMpeg4(Data([0, 0, 0, 0x18] + Array("ftyp".utf8))), "eight bytes are enough")
        XCTAssertFalse(Core.isMpeg4(Data()), "an empty file")
        XCTAssertFalse(Core.isMpeg4(Data([0, 0, 0, 0x18] + Array("fty".utf8))), "cut short")
        XCTAssertFalse(Core.isMpeg4(Data(Array("ftyp".utf8) + [0, 0, 0, 0])), "ftyp at the wrong offset")
        XCTAssertFalse(Core.isMpeg4(Data([0, 0, 0, 0x18] + Array("mdat".utf8))), "a file the recorder never finalised")
        XCTAssertFalse(Core.isMpeg4(Data(Array("caff".utf8) + [0, 1, 0, 0])), "a CAF")
    }

    func testRecorderSettings_areTheWiresFormat() {
        XCTAssertEqual(Core.contentType, "audio/mp4")
        XCTAssertEqual(Core.fileExtension, "m4a")
        XCTAssertEqual(Core.sampleRate, 44_100)
        XCTAssertEqual(Core.channels, 1)
        XCTAssertEqual(Core.bitRate, 64_000)
        XCTAssertEqual(Core.maxDurationMs, 300_000)
        XCTAssertEqual(Core.minSendMs, 1000)
    }
}
