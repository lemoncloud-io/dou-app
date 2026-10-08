import CoreGraphics
import Foundation

/// The rules of the attachment picker that need neither UIKit nor AVFoundation: where picked copies
/// live and when they go, which file a later call may name, what is refused at pick time, which
/// resource of a library video is kept and under what name, when a video is converted and at what
/// size, the poster's shape, and which remote frame reads are accepted. Kept apart so the
/// ChaticTransferCoreTests bundle can compile and test them without an app host.
///
/// Layout, under the app's caches directory:
///
///     attach-pick/
///       └ <uuid>/              one per picked item, or per video kept from the in-app grid
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

    // MARK: - Library videos

    /// One of a library video's PhotoKit resources, restated without importing Photos.
    struct LibraryVideoResource: Equatable {
        enum Kind: Equatable {
            /// The video as recorded (`PHAssetResourceType.video`).
            case video
            /// The edited rendering (`.fullSizeVideo`), present only when the video was edited.
            case fullSizeVideo
            /// Anything else: adjustment data, a paired still.
            case other
        }

        let kind: Kind
        let originalFilename: String?
    }

    /// Which resource `KeepLibraryVideo` copies, and the name the copy gets in its pick folder.
    struct LibraryVideoCopy: Equatable {
        let index: Int
        let name: String
    }

    /// The resource to copy for a library video, `nil` when it has none that holds video.
    ///
    /// An edited video goes as edited — what the person sees in Photos is what they picked — so its
    /// rendering wins. That rendering is always named `FullSizeRender.mov`, so the copy takes the
    /// recorded file's name instead, with `.mov`: a rendering is QuickTime whatever the original was,
    /// and the extension is what makes `needsExport` true and PrepareVideo write an `.mp4` beside it.
    /// An unedited video is copied under its own name. Either way the name is made safe for the disk
    /// first, and a video with no usable name is `video.mov`.
    static func libraryVideoCopy(_ resources: [LibraryVideoResource]) -> LibraryVideoCopy? {
        let recorded = resources.firstIndex { $0.kind == .video }
        let recordedName = recorded.map { diskName(resources[$0].originalFilename, fallback: "") } ?? ""
        if let edited = resources.firstIndex(where: { $0.kind == .fullSizeVideo }) {
            let base = diskName((recordedName as NSString).deletingPathExtension, fallback: "video")
            return LibraryVideoCopy(index: edited, name: "\(base).mov")
        }
        guard let recorded else { return nil }
        return LibraryVideoCopy(index: recorded, name: recordedName.isEmpty ? "video.mov" : recordedName)
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

    /// The longest name, in UTF-8 bytes, a file system holds.
    static let maxNameBytes = 255

    /// The name a documents-picker copy is written under: `name` (already through `diskName`), with
    /// the photo extension its type implies appended when the type is one of the four photo formats
    /// and the name does not already end in a matching extension. `readAttachment` decides a picked
    /// photo's type from its extension alone, so a PNG named `scan` in Files could otherwise be sent
    /// but never read back. The base is cut, on a character boundary, so the result still fits
    /// `maxNameBytes`. Any other item keeps its name.
    static func documentName(_ name: String, mimeType: String?) -> String {
        guard let type = normalizedMimeType(mimeType), let ext = photoExtension(mimeType: type) else { return name }
        if photoMimeType(fileExtension: (name as NSString).pathExtension) == type { return name }
        let suffix = ".\(ext)"
        var base = name
        while !base.isEmpty, base.utf8.count + suffix.utf8.count > maxNameBytes { base.removeLast() }
        return "\(base.isEmpty ? "photo" : base)\(suffix)"
    }

    /// The extension a photo of one of the server's four types is written with.
    static func photoExtension(mimeType: String) -> String? {
        switch mimeType {
        case "image/jpeg": return "jpg"
        case "image/png": return "png"
        case "image/gif": return "gif"
        case "image/webp": return "webp"
        default: return nil
        }
    }

    /// A MIME type without parameters, lower-cased; `nil` when there is none.
    private static func normalizedMimeType(_ raw: String?) -> String? {
        let type = (raw ?? "").split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        return type.isEmpty ? nil : type
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
    /// here: its size is the conversion's, which PrepareVideo estimates before it starts (and which
    /// `KeepLibraryVideo` estimates straight away, with the same `sizeStep`).
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

    /// Which kind's limit a documents-picker item is held to, and refused under. The item is still
    /// reported as a file, but the web sends a photo or an MP4 from Files as a photo or a video and the
    /// server caps those at their own limits — so a 120 MB MP4 must not be refused at the file limit,
    /// and a 30 MB PNG must not pass under it. The system's type decides; only when there is none, or
    /// it is `application/octet-stream`, does the name's extension. Anything else is a file. The copy
    /// is sent as it is, never converted, so the caller checks it with `needsExport: false`.
    static func limitKindForDocument(mimeType: String?, fileName: String?) -> Kind {
        if let type = normalizedMimeType(mimeType), type != "application/octet-stream" {
            if photoExtension(mimeType: type) != nil { return .image }
            return type == "video/mp4" ? .video : .file
        }
        let ext = ((fileName ?? "") as NSString).pathExtension
        if photoMimeType(fileExtension: ext) != nil { return .image }
        return ext.lowercased() == "mp4" ? .video : .file
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

    // MARK: - Remote video frame

    /// How long `ReadVideoFrame` waits for the network and the decoder together before it gives up.
    /// The web waits longer than this, so the shell's own answer arrives first and the frame read is
    /// cancelled rather than left downloading for a request nobody is waiting on.
    static let frameTimeoutSeconds: Double = 20

    /// How many frame reads run at once. Each one opens its own connection and decoder; the web asks
    /// for a screenful of posters at a time, and two keep that moving without holding many decoders.
    static let frameReadsAtOnce = 2

    /// A frame request whose arguments passed.
    struct FrameRequest: Equatable {
        let url: URL
        let atMs: Double
        let maxEdge: Double
    }

    /// The request as given, or `nil` (`INVALID`) when the URL is not an `https` URL with a host, or
    /// a number is not finite, or `atMs` is negative, or `maxEdge` is not above zero. `atMs` may be 0:
    /// the first frame is a fair thing to ask for. Only `https` is read because the shell fetches it
    /// with nothing the page could not have fetched itself — a signed storage URL — and never a local
    /// file, which this call must not become a way to read.
    static func frameRequest(url raw: String, atMs: Double, maxEdge: Double) -> FrameRequest? {
        guard let url = URL(string: raw), url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty
        else { return nil }
        guard atMs.isFinite, atMs >= 0, maxEdge.isFinite, maxEdge > 0 else { return nil }
        return FrameRequest(url: url, atMs: atMs, maxEdge: maxEdge)
    }

    /// Where the frame is taken: `atMs`, or the first frame when the video is not longer than that —
    /// the poster's rule (`posterTimeSeconds`) with the time given. A duration that is unknown (nil,
    /// not finite, or not above zero) leaves `atMs` as asked.
    static func frameTimeMs(atMs: Double, durationMs: Double?) -> Double {
        guard let duration = durationMs, duration.isFinite, duration > 0 else { return atMs }
        return duration > atMs ? atMs : 0
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
