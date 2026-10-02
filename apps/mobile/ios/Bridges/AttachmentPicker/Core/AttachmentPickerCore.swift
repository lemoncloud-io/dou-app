import CoreGraphics
import Foundation

/// The rules of the attachment picker that need neither UIKit nor AVFoundation: where picked copies
/// live and when they go, which file a later call may name, what is refused at pick time, when a video
/// is converted and at what size, and the poster's shape. Kept apart so the ChaticTransferCoreTests bundle can compile and test them
/// without an app host.
///
/// Layout, under the app's caches directory:
///
///     attach-pick/
///       └ <uuid>/              one per picked item
///           ├ IMG_0001.MOV     the copy, under its own name (a photo: prepared, `IMG_0002.jpg`)
///           ├ IMG_0001.mp4     what PrepareVideo wrote, when it converted
///           └ poster.jpg       PrepareVideo's poster frame
enum AttachmentPickerCore {
    static let folder = "attach-pick"

    /// A folder whose newest change is older than this is swept at the next pick. Nothing else
    /// deletes a copy: the web acknowledges a video's upload before it sends the poster from the same
    /// folder, and a failed message is retried from the same copies.
    static let sweepAgeMs: Int64 = 24 * 60 * 60 * 1000

    static let posterName = "poster.jpg"

    // MARK: - Sweep

    /// One pick folder as the sweep sees it: the newest modification of the folder or anything in it.
    struct FolderAge: Equatable {
        let name: String
        let newestModifiedAtMs: Int64
    }

    /// The folders to delete: untouched for more than `sweepAgeMs` before `nowMs`.
    static func foldersToSweep(_ folders: [FolderAge], nowMs: Int64) -> [String] {
        folders.filter { nowMs - $0.newestModifiedAtMs > sweepAgeMs }.map(\.name)
    }

    /// Whether a resolved path is a picked file's own place: directly inside a pick folder, itself
    /// directly inside `attach-pick` — not `attach-pick/<file>`, and not anything deeper. PrepareVideo
    /// writes beside the file it is given, so a file anywhere else would scatter results.
    static func isInPickFolder(_ path: String) -> Bool {
        URL(fileURLWithPath: path).deletingLastPathComponent().deletingLastPathComponent().lastPathComponent == folder
    }

    // MARK: - Names

    /// The name a picked copy is written under. The picker's name is kept as it is, extension case
    /// included — the web judges it — except for what a file system cannot hold: path separators and
    /// control characters go, and an empty result becomes `fallback`.
    static func diskName(_ raw: String?, fallback: String) -> String {
        var scalars = String.UnicodeScalarView()
        for scalar in (raw ?? "").unicodeScalars {
            if scalar.value < 0x20 || (0x7F...0x9F).contains(scalar.value) { continue }
            scalars.append(scalar == "/" || scalar == "\\" || scalar == ":" ? "_" : scalar)
        }
        let trimmed = String(scalars).trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed != ".", trimmed != ".." else { return fallback }
        return trimmed
    }

    /// The picker's suggested name (which has no extension) joined with the extension of the file it
    /// handed over; either alone when the other is missing.
    static func pickedName(suggested: String?, fileExtension: String?) -> String? {
        let base = suggested?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let ext = fileExtension ?? ""
        if base.isEmpty { return nil }
        if ext.isEmpty || (base as NSString).pathExtension.lowercased() == ext.lowercased() { return base }
        return "\(base).\(ext)"
    }

    /// The name of PrepareVideo's result: the picked name with its extension changed to `.mp4` (or
    /// `.mp4` added when it has none).
    static func outputName(_ sourceName: String) -> String {
        let base = (sourceName as NSString).deletingPathExtension
        return "\(base.isEmpty ? sourceName : base).mp4"
    }

    /// The type of a picked photo as kept, from its extension: one of the four `PhotoLibraryCore.prepare`
    /// writes. `nil` for anything else — a video or document in the same folders is not a photo to read.
    static func photoMimeType(fileExtension: String) -> String? {
        switch fileExtension.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        default: return nil
        }
    }

    // MARK: - Pick-time refusal

    enum Kind: String {
        case image, video, file
    }

    /// The server's per-kind ceilings as the web sent them. A missing or non-positive field refuses
    /// nothing for that kind; the web checks every item again anyway.
    struct MaxBytes: Equatable {
        let image: Int64
        let video: Int64
        let file: Int64
    }

    /// Whether a picked item is refused as too large. A video that will be converted is never refused
    /// here: its size is the conversion's, which PrepareVideo estimates before it starts.
    static func isTooLarge(kind: Kind, size: Int64, needsExport: Bool, max: MaxBytes) -> Bool {
        let limit: Int64
        switch kind {
        case .image: limit = max.image
        case .video:
            if needsExport { return false }
            limit = max.video
        case .file: limit = max.file
        }
        return limit > 0 && size > limit
    }

    /// What `pick` opens for: at least one item, so a picker is never opened without a limit.
    static func selectionLimit(_ requested: Int) -> Int { Swift.max(requested, 1) }

    // MARK: - Conversion

    /// What the source's tracks say, read by the OS layer.
    struct VideoFacts: Equatable {
        /// The file's own extension, which decides the container the web declares.
        let fileExtension: String
        /// The video track's codec as a four-character code (`avc1`, `hvc1`), `nil` without one.
        let videoCodec: String?
        /// `nil` when the file has no audio track.
        let audioCodec: String?
        /// Display size: the natural size with the track's rotation applied.
        let width: Int
        let height: Int
    }

    /// Four-character codes of H.264 video and AAC audio as AVFoundation reports them.
    static let h264Codecs: Set<String> = ["avc1", "avc3"]
    static let aacCodecs: Set<String> = ["aac "]

    /// Whether a picked video must be converted before it can be sent. It can go as it is only when
    /// it already is what the conversion would produce: an `.mp4` of H.264 video, AAC or no audio,
    /// within 1920×1080 either way round.
    static func needsExport(_ facts: VideoFacts) -> Bool {
        guard facts.fileExtension.lowercased() == "mp4",
              let video = facts.videoCodec, h264Codecs.contains(video)
        else { return true }
        if let audio = facts.audioCodec, !aacCodecs.contains(audio) { return true }
        return !fits1080p(width: facts.width, height: facts.height)
    }

    static func fits1080p(width: Int, height: Int) -> Bool {
        Swift.max(width, height) <= 1920 && Swift.min(width, height) <= 1080
    }

    /// The conversion's output ceiling, the server's video limit.
    static let exportLimitBytes: Int64 = 300 * 1024 * 1024

    /// The hidden file one export writes before it replaces its target. Unique per export, so two
    /// exports of the same video can never write into one file.
    static func exportStagingName(_ id: UUID = UUID()) -> String {
        ".export-\(id.uuidString).mp4"
    }

    /// One running job per key, shared by every caller that asks for it while it runs. PrepareVideo
    /// keys it by the source file: the web gives up on a conversion after ten minutes and its retry
    /// asks again while the first export may still be running, and two exports of one video would
    /// write the same result and poster. The retry waits for the running one and gets its answer. A
    /// job that has finished is forgotten, so a later call runs it afresh.
    actor InFlight<Value: Sendable> {
        private var running: [String: Task<Value, Error>] = [:]

        init() {}

        func run(_ key: String, _ job: @escaping @Sendable () async throws -> Value) async throws -> Value {
            if let task = running[key] { return try await task.value }
            let task = Task<Value, Error>.detached(priority: .userInitiated) { try await job() }
            running[key] = task
            // Only the caller that started the job removes it; until then a late caller joins it.
            defer { running[key] = nil }
            return try await task.value
        }

        /// How many jobs are running, for tests.
        var count: Int { running.count }
    }

    enum ExportPreset: Equatable {
        case p1080
        case p720
    }

    enum SizeStep: Equatable {
        /// Convert with this preset.
        case export(ExportPreset)
        /// Estimate again with the next preset down.
        case stepDown(ExportPreset)
        /// Over the ceiling even at the lowest preset.
        case tooLarge
    }

    /// What to do with a preset's estimated output size. 1080p over the ceiling steps down to 720p
    /// once; 720p over it is refused — a lower preset would send a video too soft to be worth it.
    /// An estimate that could not be made (nil, or 0) does not hold the conversion back: the web checks
    /// the result's real size again.
    static func sizeStep(preset: ExportPreset, estimatedBytes: Int64?, limit: Int64 = exportLimitBytes) -> SizeStep {
        guard let estimate = estimatedBytes, estimate > 0, estimate > limit else { return .export(preset) }
        switch preset {
        case .p1080: return .stepDown(.p720)
        case .p720: return .tooLarge
        }
    }

    // MARK: - Poster

    static let posterLongSide = 400
    static let posterMaxBytes = 200 * 1000
    static let posterQualities: [Double] = [0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]

    /// Where the poster frame is taken: 0.5 s in, or the first frame of a shorter video.
    static func posterTimeSeconds(durationSeconds: Double) -> Double {
        durationSeconds.isFinite && durationSeconds > 0.5 ? 0.5 : 0
    }

    /// The poster's encoded bytes at the first quality in `posterQualities` that fits `maxBytes`, or
    /// `nil` when none does or the image cannot be encoded.
    static func firstFitting(maxBytes: Int = posterMaxBytes, qualities: [Double] = posterQualities, encode: (Double) -> Data?) -> Data? {
        for quality in qualities {
            guard let data = encode(quality) else { return nil }
            if data.count <= maxBytes { return data }
        }
        return nil
    }

    /// A track's display size: its natural size turned by its preferred transform, so a portrait
    /// recording (stored landscape, rotated 90°) reports a tall size.
    static func displaySize(natural: CGSize, transform: CGAffineTransform) -> (width: Int, height: Int) {
        let turned = CGRect(origin: .zero, size: natural).applying(transform)
        return (Int(abs(turned.width).rounded()), Int(abs(turned.height).rounded()))
    }

    /// Pixel size as displayed, for a still image whose EXIF orientation (5 to 8) turns it a quarter.
    static func orientedPixelSize(width: Int, height: Int, exifOrientation: Int?) -> (width: Int, height: Int) {
        guard let orientation = exifOrientation, (5...8).contains(orientation) else { return (width, height) }
        return (height, width)
    }
}
