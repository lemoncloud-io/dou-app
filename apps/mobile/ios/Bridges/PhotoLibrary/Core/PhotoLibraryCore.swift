import Foundation
import ImageIO

/// The rules of the photo-library bridge that do not need PhotoKit: paging, access, albums, which
/// media a list holds, how a list's previews are made in parallel, and the form a picked photo leaves
/// the device in. Kept apart so the ChaticTransferCoreTests bundle can
/// compile and test them without an app host.
enum PhotoLibraryCore {
    /// The largest page the shell hands back. A page is base64 thumbnails held in page memory, and the
    /// web asks for 60; a runaway `limit` should not turn into the whole library in one reply.
    static let maxPageSize = 200

    /// Long edge of a grid preview, in pixels, when the request names no `thumbSize`.
    static let thumbnailEdge = 256

    /// The range a requested `thumbSize` is clamped to, so a runaway size cannot turn a page of base64
    /// previews into a page of photos. Android clamps to the same range.
    static let minThumbSize = 64
    static let maxThumbSize = 720

    /// JPEG quality of a sized preview. The legacy preview keeps its 0.7.
    static let sizedJpegQuality = 0.8

    /// Long edge a camera RAW photo is rendered at. A 48 MP ProRAW decoded at full size holds about
    /// 200 MB and its JPEG passes the server's 20 MB ceiling, so it would be read, carried across the
    /// bridge as base64 and then refused. 4096 px is still larger than anything the chat displays.
    static let rawMaxEdge = 4096

    /// JPEG quality for anything the shell has to re-encode.
    static let jpegQuality = 0.9

    // MARK: - Access

    /// PhotoKit's authorization, restated without importing Photos.
    enum Authorization {
        case notDetermined, restricted, denied, authorized, limited
    }

    /// The contract's `PhotoLibraryAccess`. `restricted` (parental controls, MDM) is `denied` to the
    /// page: either way nothing can be listed, and the settings prompt is the only thing to offer.
    static func access(_ authorization: Authorization) -> String {
        switch authorization {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .notDetermined, .restricted, .denied: return "denied"
        }
    }

    // MARK: - Media types

    /// What a list may hold. The web asks for videos only where it can send them; everything else
    /// (the profile-photo picker, an older web) asks for nothing and gets the still images it always got.
    enum MediaType: String {
        case image, video
    }

    /// The `mediaTypes` a list request names. Entries this shell does not know are ignored, and a
    /// request that names none it knows — absent, empty, not a list — lists still images only, so an
    /// unexpected value never widens the grid.
    static func mediaTypes(_ raw: Any?) -> Set<MediaType> {
        let named = Set((raw as? [Any] ?? []).compactMap { ($0 as? String).flatMap(MediaType.init(rawValue:)) })
        return named.isEmpty ? [.image] : named
    }

    /// A video's length as the grid shows it, in whole milliseconds. PhotoKit reports seconds as a
    /// double; anything it cannot measure reads as 0 rather than an invalid number in the reply.
    static func durationMs(seconds: Double) -> Int {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return Int((seconds * 1000).rounded())
    }

    // MARK: - Albums

    /// The id of the first album, the whole library. The web treats the first album as "all photos"
    /// and hands its id back; a fixed id keeps that true even on a device where PhotoKit has no
    /// user-library collection to name it by.
    static let allPhotosAlbumId = "all"

    /// Whether a `ListPhotos.albumId` means the whole library. Omitting it does too.
    static func isAllPhotos(_ albumId: String?) -> Bool {
        albumId == nil || albumId == allPhotosAlbumId
    }

    // MARK: - Paging

    /// Where the next page starts: the offset it was cut at, and the id of the last photo sent.
    ///
    /// The offset alone would repeat or skip a photo whenever the library changes between pages — a
    /// photo taken while the grid is open shifts every index by one. The anchor survives that: the
    /// next page starts right after wherever that photo now is. The offset is the fallback for when the
    /// anchor itself was deleted meanwhile.
    struct Cursor: Equatable {
        let offset: Int
        let anchorId: String
    }

    static func encode(_ cursor: Cursor) -> String {
        "\(cursor.offset):\(cursor.anchorId)"
    }

    /// Nil for anything this shell did not write, which starts the list from the top rather than
    /// failing the page.
    static func decode(_ raw: String?) -> Cursor? {
        guard let raw, let separator = raw.firstIndex(of: ":") else { return nil }
        guard let offset = Int(raw[..<separator]), offset >= 0 else { return nil }
        let anchorId = String(raw[raw.index(after: separator)...])
        guard !anchorId.isEmpty else { return nil }
        return Cursor(offset: offset, anchorId: anchorId)
    }

    /// The first index of the page after `cursor`, given where its anchor sits now (nil: gone).
    static func resumeIndex(_ cursor: Cursor?, anchorIndex: Int?) -> Int {
        guard let cursor else { return 0 }
        if let anchorIndex { return anchorIndex + 1 }
        return cursor.offset
    }

    /// The indices one page covers, and whether another page follows. A limit below one still returns
    /// one photo, so a page is never empty while photos remain.
    static func page(start: Int, limit: Int, total: Int) -> (range: Range<Int>, hasMore: Bool) {
        let size = min(max(limit, 1), maxPageSize)
        let lower = min(max(start, 0), total)
        let upper = min(lower + size, total)
        return (lower..<upper, upper < total)
    }

    /// A request's `offset`: where a page cut by index starts. Nil — page by cursor, as before — when it
    /// is absent, not a number, not finite or negative. A fractional offset is floored, and one past any
    /// list's length is capped well inside `Int` rather than trapping on the conversion.
    static func offset(_ raw: Any?) -> Int? {
        guard let value = number(raw), value.isFinite, value >= 0 else { return nil }
        return Int(min(value.rounded(.down), Double(Int32.max)))
    }

    // MARK: - Sized previews

    /// A request's `thumbSize`: the side of the square preview, in pixels. Nil — the legacy uncropped
    /// preview — when it is absent, not a number, not finite or not positive; otherwise rounded and
    /// clamped to `minThumbSize...maxThumbSize`.
    static func thumbSize(_ raw: Any?) -> Int? {
        guard let value = number(raw), value.isFinite, value > 0 else { return nil }
        let clamped = min(max(value.rounded(), Double(minThumbSize)), Double(maxThumbSize))
        return Int(clamped)
    }

    /// The side of the square box a fit-within image is requested in, so that the image's short side
    /// comes out at `size` and its centre square can be cut at full sharpness: `size * long / short`,
    /// rounded up.
    ///
    /// The ratio is capped at 3: a 10:1 panorama would otherwise be decoded 7200 px long for a 720 px
    /// tile. Past 3:1 its square comes out a little under `size`, which a tile of a panorama can afford.
    /// Which side is the long one does not matter — a square box fits either way — so width and height
    /// stored unrotated give the same box. Unknown dimensions ask for `size` itself.
    static func fitBox(width: Int, height: Int, size: Int) -> Int {
        guard width > 0, height > 0 else { return size }
        let long = max(width, height)
        let short = min(width, height)
        guard long < 3 * short else { return 3 * size }
        return (size * long + short - 1) / short
    }

    /// The centred square of an image `width` × `height` pixels: its side is the short side, and the
    /// long side loses the same amount at each end (the odd pixel at the far end).
    static func centerSquare(width: Int, height: Int) -> (x: Int, y: Int, side: Int) {
        let side = min(width, height)
        return ((width - side) / 2, (height - side) / 2, side)
    }

    /// The side the preview is finally drawn at: `size`, or the image's short side when the image is
    /// smaller — a preview is never upscaled. Unknown dimensions keep `size`.
    static func squareSide(size: Int, width: Int, height: Int) -> Int {
        guard width > 0, height > 0 else { return size }
        return min(size, min(width, height))
    }

    /// The largest square preview Photos makes from the small rendition it keeps of every photo. Past
    /// it, PhotoKit decodes the original instead: a preview took about 5 ms up to this side and about
    /// 30 ms from 368 px, whatever the photo's shape — on an iPhone 14 Pro (iOS 26) with a library of
    /// 12 MP photos, and the same on iOS 18 and 26 simulators.
    static let storedPreviewSide = 352

    /// The largest size answered at `storedPreviewSide`, 1.25× it: a tile drawn up to that much larger
    /// than its preview stays close to sharp, and a page of them is ready several times sooner.
    static let storedPreviewReach = storedPreviewSide * 5 / 4

    /// The side a preview asked at `size` is made at: `storedPreviewSide` when `size` is above it and at
    /// most `storedPreviewReach`, otherwise `size`. Three columns on a phone ask for 384–432 and get the
    /// stored rendition; two columns on a 3× phone ask for about 600, past the reach, and get a decode
    /// of the original at full sharpness.
    static func previewSide(_ size: Int) -> Int {
        guard size > storedPreviewSide, size <= storedPreviewReach else { return size }
        return storedPreviewSide
    }

    // MARK: - Parallel previews

    /// The most previews one list makes at the same time. Each one in flight holds a decode — up to a
    /// 2160 × 720 bitmap for a panorama at the largest size — so the count is bounded for memory as
    /// much as for CPU.
    static let maxPreviewWorkers = 4

    /// How many previews a list makes at once on a device with `cpuCount` cores: one core is left to
    /// the UI and the WebView, and never fewer than one worker or more than `maxPreviewWorkers`.
    static func previewWorkers(_ cpuCount: Int) -> Int {
        min(maxPreviewWorkers, max(1, cpuCount - 1))
    }

    /// `transform` applied to `0..<count`, up to `workers` at a time, answered in index order.
    ///
    /// Worker `w` takes the indices `w, w + workers, …`, so every index is computed exactly once and by
    /// one worker only; each writes its own slot of a preallocated buffer, which is why no lock is
    /// needed. One worker or fewer is a plain map on the calling thread. The call returns once every
    /// index is done.
    static func parallelMap<T>(count: Int, workers: Int, _ transform: (Int) -> T) -> [T] {
        guard count > 0 else { return [] }
        let lanes = min(workers, count)
        guard lanes > 1 else { return (0..<count).map(transform) }

        var results = [T?](repeating: nil, count: count)
        results.withUnsafeMutableBufferPointer { buffer in
            let slots = buffer
            DispatchQueue.concurrentPerform(iterations: lanes) { lane in
                for index in stride(from: lane, to: count, by: lanes) {
                    slots[index] = transform(index)
                }
            }
        }
        // Every slot was written above; a T that is itself optional keeps its nil inside the slot.
        return results.map { $0! }
    }

    /// A JSON number from the bridge. A boolean crosses as an `NSNumber` too, and is not one.
    private static func number(_ raw: Any?) -> Double? {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        return number.doubleValue
    }

    // MARK: - Export

    /// What a picked photo's bytes need before the web can send them.
    enum Export: Equatable {
        /// Sent as stored.
        case original(mimeType: String, fileExtension: String)
        /// Sent as stored, with the location removed from its metadata — the pixels are not re-encoded.
        case stripLocation(mimeType: String, fileExtension: String)
        /// Re-encoded as JPEG: the server takes png, jpeg, gif and webp and answers anything else
        /// (HEIC, HEIF, TIFF) with a 415. `maxEdge` is set only for camera RAW.
        case jpeg(maxEdge: Int?)
    }

    /// Decided by the data's type identifier.
    ///
    /// A GIF goes up untouched: rewriting it through ImageIO risks its frames, and it carries no
    /// location. WebP goes up untouched because ImageIO cannot write it. JPEG and PNG keep their pixels
    /// but lose GPS — a photo picked from the grid should not carry where it was taken to everyone in
    /// the room.
    static func export(forTypeIdentifier uti: String?) -> Export {
        switch uti?.lowercased() {
        case "public.jpeg": return .stripLocation(mimeType: "image/jpeg", fileExtension: "jpg")
        case "public.png": return .stripLocation(mimeType: "image/png", fileExtension: "png")
        case "com.compuserve.gif": return .original(mimeType: "image/gif", fileExtension: "gif")
        case "org.webmproject.webp": return .original(mimeType: "image/webp", fileExtension: "webp")
        default:
            // Every camera RAW identifier ends this way — `public.camera-raw-image`, DNG's
            // `com.adobe.raw-image`, `com.canon.cr2-raw-image` — and a string check needs no type
            // database lookup, which is slow and, for DNG, does not report the conformance anyway.
            let isRaw = uti?.lowercased().hasSuffix("raw-image") ?? false
            return .jpeg(maxEdge: isRaw ? rawMaxEdge : nil)
        }
    }

    /// The name the photo is sent under: the library's original name with the extension its bytes now
    /// have. `IMG_0001.HEIC` converted to JPEG goes up as `IMG_0001.jpg`, not as a `.HEIC` holding JPEG.
    static func fileName(original: String?, fileExtension: String) -> String {
        let trimmed = original?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let base = trimmed.isEmpty ? "photo" : (trimmed as NSString).deletingPathExtension
        return "\(base.isEmpty ? "photo" : base).\(fileExtension)"
    }

    /// Bytes ready to send.
    struct Prepared: Equatable {
        let data: Data
        let mimeType: String
        let fileExtension: String
    }

    /// The library's bytes in the form `export` chose. Nil when the image cannot be decoded.
    ///
    /// Whatever path is taken, the result is checked for a location once more: the check costs one
    /// metadata read, and a copy that kept its GPS is not a failure anyone would notice. One that did
    /// is redrawn into a new bitmap, which carries no XMP, and refused if even that keeps a location.
    static func prepare(_ data: Data, typeIdentifier uti: String?) -> Prepared? {
        let prepared: Prepared?
        switch export(forTypeIdentifier: uti) {
        case let .original(mimeType, fileExtension):
            prepared = Prepared(data: data, mimeType: mimeType, fileExtension: fileExtension)
        case let .stripLocation(mimeType, fileExtension):
            prepared = withoutLocation(data, uti: uti).map { Prepared(data: $0, mimeType: mimeType, fileExtension: fileExtension) }
                ?? jpeg(data, maxEdge: nil).map { Prepared(data: $0, mimeType: "image/jpeg", fileExtension: "jpg") }
        case let .jpeg(maxEdge):
            prepared = jpeg(data, maxEdge: maxEdge).map { Prepared(data: $0, mimeType: "image/jpeg", fileExtension: "jpg") }
        }
        guard let prepared else { return nil }
        guard hasLocation(prepared.data) else { return prepared }
        guard let edge = longEdge(prepared.data), let redrawn = jpeg(prepared.data, maxEdge: edge), !hasLocation(redrawn) else {
            return nil
        }
        return Prepared(data: redrawn, mimeType: "image/jpeg", fileExtension: "jpg")
    }

    /// The longer side in pixels, as stored.
    static func longEdge(_ data: Data) -> Int? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int else { return nil }
        return max(width, height)
    }

    /// Whether the image still says where it was taken — in its GPS dictionary, or as an `exif:GPS…`
    /// tag in its XMP.
    static func hasLocation(_ data: Data) -> Bool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return false }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        if properties?[kCGImagePropertyGPSDictionary] != nil { return true }
        guard let metadata = CGImageSourceCopyMetadataAtIndex(source, 0, nil),
              let tags = CGImageMetadataCopyTags(metadata) as? [CGImageMetadataTag] else { return false }
        return tags.contains { (CGImageMetadataTagCopyName($0) as String?)?.hasPrefix("GPS") ?? false }
    }

    /// The image with its location removed and its pixels as they were.
    ///
    /// A JPEG's compressed data is copied as is, with metadata rebuilt without its GPS tags. That
    /// metadata is handed over explicitly: with the exclude flag alone the copy comes out with no
    /// metadata at all, orientation included, and a portrait photo would go up on its side.
    ///
    /// A PNG is re-encoded instead. On iOS a PNG's copy kept its GPS whatever metadata it was given,
    /// and PNG is lossless, so encoding the decoded image again with the GPS dictionary cleared keeps
    /// every pixel.
    static func withoutLocation(_ data: Data, uti: String?) -> Data? {
        guard let uti, let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, uti as CFString, 1, nil) else { return nil }

        if uti.lowercased() == "public.png" {
            let properties: [CFString: Any] = [kCGImagePropertyGPSDictionary: kCFNull as Any]
            CGImageDestinationAddImageFromSource(destination, source, CGImageSourceGetPrimaryImageIndex(source), properties as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { return nil }
            return output as Data
        }

        var options: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: true]
        if let metadata = CGImageSourceCopyMetadataAtIndex(source, 0, nil) { options[kCGImageDestinationMetadata] = withoutGPSTags(metadata) }
        guard CGImageDestinationCopyImageSource(destination, source, options as CFDictionary, nil) else { return nil }
        return output as Data
    }

    /// The metadata rebuilt without its GPS tags: every other tag is copied into new metadata, with its
    /// namespace registered first. Removing the GPS tags from a copy instead left some of them behind.
    private static func withoutGPSTags(_ metadata: CGImageMetadata) -> CGImageMetadata {
        let clean = CGImageMetadataCreateMutable()
        for tag in (CGImageMetadataCopyTags(metadata) as? [CGImageMetadataTag]) ?? [] {
            guard let name = CGImageMetadataTagCopyName(tag) as String?, !name.hasPrefix("GPS"),
                  let prefix = CGImageMetadataTagCopyPrefix(tag) else { continue }
            if let namespace = CGImageMetadataTagCopyNamespace(tag) {
                CGImageMetadataRegisterNamespaceForPrefix(clean, namespace, prefix, nil)
            }
            CGImageMetadataSetTagWithPath(clean, nil, "\(prefix as String):\(name)" as CFString, tag)
        }
        return clean
    }

    /// The primary image as JPEG, without its location.
    ///
    /// At full size the orientation stays a tag, which the web's decode applies. Scaled down (`maxEdge`)
    /// the orientation is drawn into the pixels instead, because the scaled image is a new bitmap the
    /// source's tag no longer describes.
    static func jpeg(_ data: Data, maxEdge: Int?) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let index = CGImageSourceGetPrimaryImageIndex(source)
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, "public.jpeg" as CFString, 1, nil) else { return nil }

        if let maxEdge {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxEdge,
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary) else { return nil }
            var properties = (CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]) ?? [:]
            properties[kCGImagePropertyGPSDictionary] = nil
            properties[kCGImagePropertyOrientation] = 1
            properties[kCGImagePropertyPixelWidth] = nil
            properties[kCGImagePropertyPixelHeight] = nil
            if var tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
                tiff[kCGImagePropertyTIFFOrientation] = 1
                properties[kCGImagePropertyTIFFDictionary] = tiff
            }
            properties[kCGImageDestinationLossyCompressionQuality] = jpegQuality
            CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        } else {
            let properties: [CFString: Any] = [
                kCGImageDestinationLossyCompressionQuality: jpegQuality,
                kCGImagePropertyGPSDictionary: kCFNull as Any,
            ]
            CGImageDestinationAddImageFromSource(destination, source, index, properties as CFDictionary)
        }
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
