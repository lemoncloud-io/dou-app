import ImageIO
import UniformTypeIdentifiers
import XCTest

/// The photo-library rules that need no PhotoKit. `Bridges/PhotoLibrary/Core/PhotoLibraryCore.swift`
/// reaches this bundle as an explicit file reference, like the transfer core does.
final class PhotoLibraryCoreTests: XCTestCase {
    // MARK: - Access

    func testAccessMapsPhotoKitAuthorization() {
        XCTAssertEqual(PhotoLibraryCore.access(.authorized), "granted")
        XCTAssertEqual(PhotoLibraryCore.access(.limited), "limited")
        XCTAssertEqual(PhotoLibraryCore.access(.denied), "denied")
    }

    func testRestrictedAndUnaskedAreDeniedToThePage() {
        XCTAssertEqual(PhotoLibraryCore.access(.restricted), "denied")
        XCTAssertEqual(PhotoLibraryCore.access(.notDetermined), "denied")
    }

    // MARK: - Media types

    func testMediaTypesTakeEveryKnownEntry() {
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["image"]), [.image])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["video"]), [.video])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["image", "video"]), [.image, .video])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["video", "video"]), [.video])
    }

    func testUnknownMediaTypeEntriesAreIgnored() {
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["video", "audio", 3] as [Any]), [.video])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["Video"]), [.image], "case is not forgiven: nothing known was named")
    }

    func testNoKnownMediaTypeListsStillImagesAsBefore() {
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(nil), [.image])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes([String]()), [.image])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(["gif"]), [.image])
        XCTAssertEqual(PhotoLibraryCore.mediaTypes("video"), [.image], "a bare string is not a list")
        XCTAssertEqual(PhotoLibraryCore.mediaTypes(NSNull()), [.image])
    }

    func testMediaTypesReadTheArrayTheBridgeHandsOver() {
        let fromBridge: NSDictionary = ["mediaTypes": NSArray(array: ["image", "video"])]

        XCTAssertEqual(PhotoLibraryCore.mediaTypes(fromBridge["mediaTypes"]), [.image, .video])
    }

    func testDurationIsWholeMillisecondsRounded() {
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: 12.3456), 12_346)
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: 0.0004), 0)
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: 3_600), 3_600_000)
    }

    func testUnmeasurableDurationIsZero() {
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: 0), 0)
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: -1), 0)
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: .nan), 0)
        XCTAssertEqual(PhotoLibraryCore.durationMs(seconds: .infinity), 0)
    }

    // MARK: - Albums

    func testTheFixedIdAndNoIdBothMeanAllPhotos() {
        XCTAssertTrue(PhotoLibraryCore.isAllPhotos(nil))
        XCTAssertTrue(PhotoLibraryCore.isAllPhotos(PhotoLibraryCore.allPhotosAlbumId))
        XCTAssertFalse(PhotoLibraryCore.isAllPhotos("ABC-123/L0/040"))
    }

    // MARK: - Cursor

    func testCursorRoundTripsAnIdentifierWithSlashesAndColons() {
        let cursor = PhotoLibraryCore.Cursor(offset: 60, anchorId: "ABC-123/L0/001:extra")

        XCTAssertEqual(PhotoLibraryCore.decode(PhotoLibraryCore.encode(cursor)), cursor)
    }

    func testForeignOrBrokenCursorsDecodeToNil() {
        XCTAssertNil(PhotoLibraryCore.decode(nil))
        XCTAssertNil(PhotoLibraryCore.decode(""))
        XCTAssertNil(PhotoLibraryCore.decode("60"))
        XCTAssertNil(PhotoLibraryCore.decode("sixty:ABC"))
        XCTAssertNil(PhotoLibraryCore.decode("-1:ABC"))
        XCTAssertNil(PhotoLibraryCore.decode("60:"))
    }

    func testResumeStartsAfterTheAnchorWhereverItNowIs() {
        let cursor = PhotoLibraryCore.Cursor(offset: 60, anchorId: "A")

        // A photo taken since the last page pushed the anchor down by one.
        XCTAssertEqual(PhotoLibraryCore.resumeIndex(cursor, anchorIndex: 60), 61)
    }

    func testResumeFallsBackToTheOffsetWhenTheAnchorIsGone() {
        let cursor = PhotoLibraryCore.Cursor(offset: 60, anchorId: "A")

        XCTAssertEqual(PhotoLibraryCore.resumeIndex(cursor, anchorIndex: nil), 60)
    }

    func testNoCursorStartsAtTheTop() {
        XCTAssertEqual(PhotoLibraryCore.resumeIndex(nil, anchorIndex: nil), 0)
    }

    // MARK: - Page

    func testPageCutsAtTheLimitAndSaysMoreFollow() {
        let page = PhotoLibraryCore.page(start: 0, limit: 60, total: 100)

        XCTAssertEqual(page.range, 0..<60)
        XCTAssertTrue(page.hasMore)
    }

    func testLastPageStopsAtTheEnd() {
        let page = PhotoLibraryCore.page(start: 60, limit: 60, total: 100)

        XCTAssertEqual(page.range, 60..<100)
        XCTAssertFalse(page.hasMore)
    }

    func testLimitIsCappedAndNeverBelowOne() {
        XCTAssertEqual(PhotoLibraryCore.page(start: 0, limit: 10_000, total: 1_000).range.count, PhotoLibraryCore.maxPageSize)
        XCTAssertEqual(PhotoLibraryCore.page(start: 0, limit: 0, total: 10).range, 0..<1)
    }

    func testStartPastTheEndIsAnEmptyLastPage() {
        let page = PhotoLibraryCore.page(start: 120, limit: 60, total: 100)

        XCTAssertTrue(page.range.isEmpty)
        XCTAssertFalse(page.hasMore)
    }

    // MARK: - Offset

    func testOffsetTakesANonNegativeNumberFloored() {
        XCTAssertEqual(PhotoLibraryCore.offset(0), 0)
        XCTAssertEqual(PhotoLibraryCore.offset(120), 120)
        XCTAssertEqual(PhotoLibraryCore.offset(2.7), 2)
        XCTAssertEqual(PhotoLibraryCore.offset(NSNumber(value: 60)), 60)
    }

    func testMissingOrInvalidOffsetPagesByCursor() {
        XCTAssertNil(PhotoLibraryCore.offset(nil))
        XCTAssertNil(PhotoLibraryCore.offset(-1))
        XCTAssertNil(PhotoLibraryCore.offset(-0.5))
        XCTAssertNil(PhotoLibraryCore.offset("60"), "a string is not a number")
        XCTAssertNil(PhotoLibraryCore.offset(true), "a boolean is not a number")
        XCTAssertNil(PhotoLibraryCore.offset(Double.nan))
        XCTAssertNil(PhotoLibraryCore.offset(Double.infinity))
        XCTAssertNil(PhotoLibraryCore.offset(NSNull()))
    }

    func testHugeOffsetIsCappedRatherThanTrapping() {
        XCTAssertEqual(PhotoLibraryCore.offset(1e300), Int(Int32.max))
    }

    func testOffsetReadsTheNumberTheBridgeHandsOver() {
        let fromBridge: NSDictionary = ["offset": NSNumber(value: 240.0)]

        XCTAssertEqual(PhotoLibraryCore.offset(fromBridge["offset"]), 240)
    }

    func testOffsetPageCoversTheIndicesFromTheOffset() {
        let page = PhotoLibraryCore.page(start: 120, limit: 60, total: 1_000)

        XCTAssertEqual(page.range, 120..<180)
    }

    func testOffsetPageStopsAtTheEnd() {
        let page = PhotoLibraryCore.page(start: 980, limit: 60, total: 1_000)

        XCTAssertEqual(page.range, 980..<1_000)
    }

    func testOffsetPastTheEndIsAnEmptyPageAtTheTotal() {
        let page = PhotoLibraryCore.page(start: 1_200, limit: 60, total: 1_000)

        XCTAssertEqual(page.range, 1_000..<1_000, "the echoed offset is the clamped start")
        XCTAssertEqual(PhotoLibraryCore.page(start: 5, limit: 60, total: 0).range, 0..<0)
    }

    // MARK: - Thumb size

    func testThumbSizeIsRoundedAndClamped() {
        XCTAssertEqual(PhotoLibraryCore.thumbSize(300), 300)
        XCTAssertEqual(PhotoLibraryCore.thumbSize(299.5), 300)
        XCTAssertEqual(PhotoLibraryCore.thumbSize(299.4), 299)
        XCTAssertEqual(PhotoLibraryCore.thumbSize(10), PhotoLibraryCore.minThumbSize)
        XCTAssertEqual(PhotoLibraryCore.thumbSize(0.2), PhotoLibraryCore.minThumbSize)
        XCTAssertEqual(PhotoLibraryCore.thumbSize(4_000), PhotoLibraryCore.maxThumbSize)
        XCTAssertEqual(PhotoLibraryCore.thumbSize(1e300), PhotoLibraryCore.maxThumbSize)
    }

    func testMissingOrInvalidThumbSizeKeepsTheLegacyPreview() {
        XCTAssertNil(PhotoLibraryCore.thumbSize(nil))
        XCTAssertNil(PhotoLibraryCore.thumbSize(0))
        XCTAssertNil(PhotoLibraryCore.thumbSize(-200))
        XCTAssertNil(PhotoLibraryCore.thumbSize("300"), "a string is not a number")
        XCTAssertNil(PhotoLibraryCore.thumbSize(true), "a boolean is not a number")
        XCTAssertNil(PhotoLibraryCore.thumbSize(Double.nan))
        XCTAssertNil(PhotoLibraryCore.thumbSize(Double.infinity))
    }

    func testThumbSizeReadsTheNumberTheBridgeHandsOver() {
        let fromBridge: NSDictionary = ["thumbSize": NSNumber(value: 360)]

        XCTAssertEqual(PhotoLibraryCore.thumbSize(fromBridge["thumbSize"]), 360)
    }

    func testFitBoxMakesTheShortSideTheSize() {
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 4_032, height: 3_024, size: 300), 400)
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 1_000, height: 1_000, size: 300), 300)
        // 300 * 16 / 9 = 533.33, rounded up so the short side is never under the size.
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 1_920, height: 1_080, size: 300), 534)
    }

    func testFitBoxIgnoresWhichSideIsLong() {
        XCTAssertEqual(
            PhotoLibraryCore.fitBox(width: 3_024, height: 4_032, size: 300),
            PhotoLibraryCore.fitBox(width: 4_032, height: 3_024, size: 300)
        )
    }

    func testFitBoxCapsAPanoramaAtThreeToOne() {
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 10_000, height: 1_000, size: 720), 2_160)
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 3_000, height: 1_000, size: 720), 2_160)
    }

    func testFitBoxWithUnknownDimensionsIsTheSize() {
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 0, height: 3_024, size: 300), 300)
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: 4_032, height: 0, size: 300), 300)
        XCTAssertEqual(PhotoLibraryCore.fitBox(width: -1, height: -1, size: 300), 300)
    }

    func testCenterSquareCutsTheLongSideEvenly() {
        let landscape = PhotoLibraryCore.centerSquare(width: 400, height: 300)
        XCTAssertEqual([landscape.x, landscape.y, landscape.side], [50, 0, 300])

        let portrait = PhotoLibraryCore.centerSquare(width: 300, height: 400)
        XCTAssertEqual([portrait.x, portrait.y, portrait.side], [0, 50, 300])

        let square = PhotoLibraryCore.centerSquare(width: 256, height: 256)
        XCTAssertEqual([square.x, square.y, square.side], [0, 0, 256])
    }

    func testCenterSquareLeavesTheOddPixelAtTheFarEnd() {
        let odd = PhotoLibraryCore.centerSquare(width: 401, height: 300)

        XCTAssertEqual([odd.x, odd.y, odd.side], [50, 0, 300])
    }

    func testSquareSideNeverUpscales() {
        XCTAssertEqual(PhotoLibraryCore.squareSide(size: 300, width: 400, height: 400), 300)
        XCTAssertEqual(PhotoLibraryCore.squareSide(size: 300, width: 200, height: 200), 200)
        XCTAssertEqual(PhotoLibraryCore.squareSide(size: 300, width: 500, height: 120), 120)
    }

    func testSquareSideWithUnknownDimensionsIsTheSize() {
        XCTAssertEqual(PhotoLibraryCore.squareSide(size: 300, width: 0, height: 200), 300)
        XCTAssertEqual(PhotoLibraryCore.squareSide(size: 300, width: 200, height: -1), 300)
    }

    // MARK: - Export

    func testServerFormatsKeepTheirBytes() {
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "public.jpeg"), .stripLocation(mimeType: "image/jpeg", fileExtension: "jpg"))
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "public.png"), .stripLocation(mimeType: "image/png", fileExtension: "png"))
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "com.compuserve.gif"), .original(mimeType: "image/gif", fileExtension: "gif"))
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "org.webmproject.webp"), .original(mimeType: "image/webp", fileExtension: "webp"))
    }

    func testEverythingElseBecomesJpegAtFullSize() {
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "public.heic"), .jpeg(maxEdge: nil))
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "public.tiff"), .jpeg(maxEdge: nil))
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: nil), .jpeg(maxEdge: nil))
    }

    func testCameraRawIsRenderedAtTheCap() {
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "com.adobe.raw-image"), .jpeg(maxEdge: PhotoLibraryCore.rawMaxEdge))
        XCTAssertEqual(PhotoLibraryCore.export(forTypeIdentifier: "com.apple.raw-image"), .jpeg(maxEdge: PhotoLibraryCore.rawMaxEdge))
    }

    // MARK: - File name

    func testFileNameTakesTheExtensionOfTheBytesSent() {
        XCTAssertEqual(PhotoLibraryCore.fileName(original: "IMG_0001.HEIC", fileExtension: "jpg"), "IMG_0001.jpg")
        XCTAssertEqual(PhotoLibraryCore.fileName(original: "cat.gif", fileExtension: "gif"), "cat.gif")
    }

    func testMissingFileNameFallsBackToPhoto() {
        XCTAssertEqual(PhotoLibraryCore.fileName(original: nil, fileExtension: "jpg"), "photo.jpg")
        XCTAssertEqual(PhotoLibraryCore.fileName(original: "  ", fileExtension: "jpg"), "photo.jpg")
    }

    // MARK: - Prepare (ImageIO)

    private static let gps: [CFString: Any] = [
        kCGImagePropertyGPSLatitude: 37.5665, kCGImagePropertyGPSLatitudeRef: "N",
        kCGImagePropertyGPSLongitude: 126.978, kCGImagePropertyGPSLongitudeRef: "E",
    ]

    private func bitmap(width: Int, height: Int, red: CGFloat = 0.2) -> CGImage {
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(red: red, green: 0.4, blue: 0.8, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()!
    }

    /// Encodes `frames` as `type`, every frame carrying `properties`. Nil when this runtime cannot
    /// write the type (HEIC on some simulators).
    private func encode(_ type: UTType, _ frames: [CGImage], _ properties: [CFString: Any] = [:],
                        file: [CFString: Any] = [:]) -> Data? {
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, type.identifier as CFString, frames.count, nil) else { return nil }
        CGImageDestinationSetProperties(destination, file as CFDictionary)
        for frame in frames { CGImageDestinationAddImage(destination, frame, properties as CFDictionary) }
        return CGImageDestinationFinalize(destination) ? output as Data : nil
    }

    private func properties(_ data: Data) -> [CFString: Any] {
        let source = CGImageSourceCreateWithData(data as CFData, nil)!
        return CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
    }

    private let rotated: [CFString: Any] = [
        kCGImagePropertyOrientation: 6,
        kCGImagePropertyGPSDictionary: PhotoLibraryCoreTests.gps,
        kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2026:09:30 10:00:00"],
    ]

    func testJpegLosesItsLocationAndKeepsOrientationAndExif() throws {
        let original = try XCTUnwrap(encode(.jpeg, [bitmap(width: 400, height: 300)], rotated))
        XCTAssertTrue(PhotoLibraryCore.hasLocation(original), "fixture should carry GPS")

        let prepared = try XCTUnwrap(PhotoLibraryCore.prepare(original, typeIdentifier: "public.jpeg"))

        XCTAssertEqual(prepared.mimeType, "image/jpeg")
        XCTAssertFalse(PhotoLibraryCore.hasLocation(prepared.data))
        let out = properties(prepared.data)
        XCTAssertEqual(out[kCGImagePropertyOrientation] as? Int, 6)
        XCTAssertNotNil(out[kCGImagePropertyExifDictionary])
    }

    func testPngWithLocationStaysPngWithoutIt() throws {
        let original = try XCTUnwrap(encode(.png, [bitmap(width: 200, height: 200)], [kCGImagePropertyGPSDictionary: Self.gps]))
        XCTAssertTrue(PhotoLibraryCore.hasLocation(original), "fixture should carry GPS")

        let prepared = try XCTUnwrap(PhotoLibraryCore.prepare(original, typeIdentifier: "public.png"))

        XCTAssertFalse(PhotoLibraryCore.hasLocation(prepared.data))
        XCTAssertEqual(CGImageSourceGetType(CGImageSourceCreateWithData(prepared.data as CFData, nil)!) as String?, "public.png")
        XCTAssertEqual(pixels(prepared.data), pixels(original), "a PNG is re-encoded, but losslessly")
    }

    private func pixels(_ data: Data) -> Data? {
        let source = CGImageSourceCreateWithData(data as CFData, nil)!
        return CGImageSourceCreateImageAtIndex(source, 0, nil)?.dataProvider?.data as Data?
    }

    func testHeicBecomesJpegWithoutLocationKeepingOrientation() throws {
        guard let original = encode(.heic, [bitmap(width: 400, height: 300)], rotated) else {
            throw XCTSkip("this runtime cannot encode HEIC")
        }

        let prepared = try XCTUnwrap(PhotoLibraryCore.prepare(original, typeIdentifier: "public.heic"))

        XCTAssertEqual(prepared.mimeType, "image/jpeg")
        XCTAssertEqual(prepared.fileExtension, "jpg")
        XCTAssertFalse(PhotoLibraryCore.hasLocation(prepared.data))
        XCTAssertEqual(properties(prepared.data)[kCGImagePropertyOrientation] as? Int, 6)
    }

    func testAnimatedGifGoesUpByteForByte() throws {
        let frames = [bitmap(width: 40, height: 30, red: 0.1), bitmap(width: 40, height: 30, red: 0.9)]
        let original = try XCTUnwrap(encode(.gif, frames, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: 0.5]]))

        let prepared = try XCTUnwrap(PhotoLibraryCore.prepare(original, typeIdentifier: "com.compuserve.gif"))

        XCTAssertEqual(prepared.data, original)
        XCTAssertEqual(prepared.mimeType, "image/gif")
    }

    func testScaledJpegDrawsTheOrientationIntoThePixels() throws {
        // 400x300 stored, orientation 6: displayed as 300x400.
        let original = try XCTUnwrap(encode(.jpeg, [bitmap(width: 400, height: 300)], rotated))

        let scaled = try XCTUnwrap(PhotoLibraryCore.jpeg(original, maxEdge: 100))

        let out = properties(scaled)
        XCTAssertEqual(out[kCGImagePropertyPixelWidth] as? Int, 75)
        XCTAssertEqual(out[kCGImagePropertyPixelHeight] as? Int, 100)
        XCTAssertEqual(out[kCGImagePropertyOrientation] as? Int ?? 1, 1)
        XCTAssertFalse(PhotoLibraryCore.hasLocation(scaled))
    }

    func testUndecodableBytesPrepareToNil() {
        XCTAssertNil(PhotoLibraryCore.prepare(Data("not an image".utf8), typeIdentifier: "public.heic"))
    }
}
