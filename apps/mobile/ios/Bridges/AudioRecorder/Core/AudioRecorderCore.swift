import Foundation

/// The rules of the voice-message recorder that need neither UIKit nor AVFoundation: the limit a
/// recording is held to, how a recording that ended is reported, what its file is called and where it
/// lives, and whether the recorder wrote an MPEG-4 file. Kept apart so the ChaticTransferCoreTests
/// bundle can compile and test them without an app host.
///
/// A recording is kept in a pick folder of its own, exactly like a picked file, so the transfer
/// uploads it from there and the picker's 24-hour sweep deletes it:
///
///     attach-pick/
///       └ <uuid>/                          one per recording
///           └ voice-20261102-142530.m4a    AAC-LC, mono, 44.1 kHz, 64 kbps
enum AudioRecorderCore {
    /// The longest recording, and the limit applied when none (or a larger one) is asked for.
    static let maxDurationMs: Int64 = 300_000

    /// Under this, `send` discards the recording as `TOO_SHORT`.
    static let minSendMs: Int64 = 1000

    /// How early before its limit the recorder may stop and still count as having reached it. The
    /// limit is counted in recorded audio, which never runs ahead of the wall clock the elapsed time is
    /// read from; a stop the shell did not ask for any earlier than this was the system cutting it off.
    static let limitSlackMs: Int64 = 500

    static let contentType = "audio/mp4"
    static let fileExtension = "m4a"
    static let sampleRate: Double = 44_100
    static let channels = 1
    static let bitRate = 64_000

    // MARK: - Start

    /// The limit applied to a recording: `requested` when it is finite and within (0, `maxDurationMs`],
    /// else `maxDurationMs`. A fraction of a millisecond is dropped.
    static func clampedMaxDurationMs(_ requested: Double?) -> Int64 {
        guard let requested, requested.isFinite, requested > 0, requested <= Double(maxDurationMs) else {
            return maxDurationMs
        }
        return Swift.max(Int64(requested), 1)
    }

    // MARK: - End

    enum StopAction: String {
        case send, cancel
    }

    /// How a recording ended; the raw value is the wire's `reason`.
    enum EndReason: String {
        case sent = "SENT"
        case maxDuration = "MAX_DURATION"
        case cancelled = "CANCELLED"
        case tooShort = "TOO_SHORT"
        case interrupted = "INTERRUPTED"
        case failed = "INTERNAL"

        /// Whether the file is kept and reported. Every other end deletes it.
        var keepsFile: Bool { self == .sent || self == .maxDuration }
    }

    /// The end `stop` reports for `action`, `elapsedMs` after the recorder started.
    static func endReason(for action: StopAction, elapsedMs: Int64) -> EndReason {
        switch action {
        case .cancel: return .cancelled
        case .send: return elapsedMs >= minSendMs ? .sent : .tooShort
        }
    }

    /// The end reported when the recorder stopped without being asked to: its limit when it got there
    /// and finished cleanly, `INTERRUPTED` when the system stopped it cleanly earlier, `INTERNAL` when
    /// it failed.
    static func finishedReason(successfully: Bool, elapsedMs: Int64, maxDurationMs: Int64) -> EndReason {
        guard successfully else { return .failed }
        return elapsedMs >= maxDurationMs - limitSlackMs ? .maxDuration : .interrupted
    }

    /// The duration reported for a kept recording: what the recorder says it recorded, or the elapsed
    /// time when it says nothing, never past `maxDurationMs`.
    static func durationMs(recordedSeconds: Double, elapsedMs: Int64, maxDurationMs: Int64) -> Int64 {
        let recorded = recordedSeconds.isFinite && recordedSeconds > 0 ? Int64((recordedSeconds * 1000).rounded()) : 0
        return Swift.min(recorded > 0 ? recorded : Swift.max(elapsedMs, 0), maxDurationMs)
    }

    // MARK: - File

    /// `voice-yyyyMMdd-HHmmss.m4a`, from when the recording started, in the device's time zone — the
    /// stamp the Android picker names an unnamed `video-…` by.
    static func fileName(startedAt: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return "voice-\(formatter.string(from: startedAt)).\(fileExtension)"
    }

    /// Where a recording is written: `<root>/<folderId>/<name>`, `root` being the picker's
    /// `attach-pick`. That is a pick folder's own place (`AttachmentPickerCore.isInPickFolder`), so the
    /// transfer and the sweep treat it as one.
    static func recordingFile(root: URL, folderId: UUID, name: String) -> URL {
        root.appendingPathComponent(folderId.uuidString, isDirectory: true).appendingPathComponent(name)
    }

    /// How many leading bytes `isMpeg4` reads.
    static let headerBytes = 8

    /// Whether a finished file is MPEG-4: bytes 4 to 7 are `ftyp`. Anything else — an empty file, one
    /// the recorder never finalised — is not sent.
    static func isMpeg4(_ head: Data) -> Bool {
        let bytes = [UInt8](head.prefix(headerBytes))
        return bytes.count >= headerBytes && Array(bytes[4..<8]) == Array("ftyp".utf8)
    }
}
