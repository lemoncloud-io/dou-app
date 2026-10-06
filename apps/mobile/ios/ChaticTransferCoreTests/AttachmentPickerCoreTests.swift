import CoreGraphics
import XCTest

/// The attachment-picker rules that need no UIKit or AVFoundation.
/// `Bridges/AttachmentPicker/Core/AttachmentPickerCore.swift` reaches this bundle as an explicit file
/// reference, like the transfer core does.
final class AttachmentPickerCoreTests: XCTestCase {
    private typealias Core = AttachmentPickerCore
    private static let hour: Int64 = 60 * 60 * 1000
    private static let mib: Int64 = 1024 * 1024

    // MARK: - Sweep

    func testSweep_takesOnlyFoldersUntouchedForMoreThanADay() {
        let now = 100 * 24 * Self.hour
        let folders = [
            Core.FolderAge(name: "old", newestModifiedAtMs: now - 24 * Self.hour - 1),
            Core.FolderAge(name: "exactly-a-day", newestModifiedAtMs: now - 24 * Self.hour),
            Core.FolderAge(name: "fresh", newestModifiedAtMs: now - Self.hour),
            Core.FolderAge(name: "future", newestModifiedAtMs: now + Self.hour),
        ]
        XCTAssertEqual(Core.foldersToSweep(folders, nowMs: now), ["old"])
        XCTAssertEqual(Core.foldersToSweep([], nowMs: now), [])
    }

    func testInPickFolder_onlyAFileDirectlyInsideItsOwnPickFolder() {
        let root = "/var/mobile/Containers/Data/Application/X/Library/Caches/attach-pick"
        XCTAssertTrue(Core.isInPickFolder("\(root)/0B8E/IMG_0001.jpg"))
        XCTAssertTrue(Core.isInPickFolder("\(root)/0B8E/poster.jpg"))
        XCTAssertFalse(Core.isInPickFolder("\(root)/IMG_0001.jpg"), "not in a pick folder of its own")
        XCTAssertFalse(Core.isInPickFolder("\(root)/0B8E/sub/IMG_0001.jpg"), "deeper than a pick folder")
        XCTAssertFalse(Core.isInPickFolder("/var/mobile/tmp/transfer-temp/0B8E/a.jpg"), "another folder")
    }

    // MARK: - Names

    func testDiskName_keepsThePickersName_butNothingAFileSystemCannotHold() {
        XCTAssertEqual(Core.diskName("IMG_0001.MOV", fallback: "video"), "IMG_0001.MOV", "extension case is the web's to judge")
        XCTAssertEqual(Core.diskName("보고서.hwp", fallback: "file"), "보고서.hwp")
        XCTAssertEqual(Core.diskName("a/b\\c:d.pdf", fallback: "file"), "a_b_c_d.pdf")
        XCTAssertEqual(Core.diskName("ta\u{0}b\u{1F}.txt", fallback: "file"), "tab.txt")
        XCTAssertEqual(Core.diskName("  spaced.pdf  ", fallback: "file"), "spaced.pdf")
        for empty in [nil, "", "   ", ".", "..", "\u{0}"] as [String?] {
            XCTAssertEqual(Core.diskName(empty, fallback: "file"), "file")
        }
    }

    func testPickedName_joinsTheSuggestedNameWithTheFilesExtension() {
        XCTAssertEqual(Core.pickedName(suggested: "IMG_0001", fileExtension: "MOV"), "IMG_0001.MOV")
        XCTAssertEqual(Core.pickedName(suggested: "IMG_0001.MOV", fileExtension: "mov"), "IMG_0001.MOV", "not doubled")
        XCTAssertEqual(Core.pickedName(suggested: "clip", fileExtension: ""), "clip")
        XCTAssertEqual(Core.pickedName(suggested: "clip", fileExtension: nil), "clip")
        XCTAssertNil(Core.pickedName(suggested: nil, fileExtension: "mp4"))
        XCTAssertNil(Core.pickedName(suggested: "  ", fileExtension: "mp4"))
    }

    func testOutputName_isThePickedNameWithAnMp4Extension() {
        XCTAssertEqual(Core.outputName("IMG_0001.MOV"), "IMG_0001.mp4")
        XCTAssertEqual(Core.outputName("clip.mp4"), "clip.mp4")
        XCTAssertEqual(Core.outputName("회의 v1.2.m4v"), "회의 v1.2.mp4")
        XCTAssertEqual(Core.outputName("noextension"), "noextension.mp4")
        XCTAssertEqual(Core.outputName(".hidden"), ".hidden.mp4")
    }

    // MARK: - Library videos

    private func resource(_ kind: Core.LibraryVideoResource.Kind, _ name: String?) -> Core.LibraryVideoResource {
        Core.LibraryVideoResource(kind: kind, originalFilename: name)
    }

    func testLibraryVideoCopy_anUneditedVideoKeepsItsOwnResourceAndName() {
        let copy = Core.libraryVideoCopy([resource(.other, "IMG_0001.AAE"), resource(.video, "IMG_0001.MOV")])
        XCTAssertEqual(copy, Core.LibraryVideoCopy(index: 1, name: "IMG_0001.MOV"))
        XCTAssertEqual(Core.libraryVideoCopy([resource(.video, "clip.mp4")])?.name, "clip.mp4", "an mp4 may go unconverted")
    }

    func testLibraryVideoCopy_anEditedVideoGoesAsEdited_underTheRecordedNameAsMov() {
        let resources = [resource(.video, "IMG_0001.MP4"), resource(.other, "Adjustments.plist"), resource(.fullSizeVideo, "FullSizeRender.mov")]
        let copy = Core.libraryVideoCopy(resources)
        XCTAssertEqual(copy, Core.LibraryVideoCopy(index: 2, name: "IMG_0001.mov"))
        let ext = ((copy?.name ?? "") as NSString).pathExtension
        XCTAssertTrue(Core.needsExport(facts(ext)), "a .mov is always converted, so PrepareVideo writes the .mp4")
    }

    func testLibraryVideoCopy_namesAreMadeSafe_andFallBackToVideo() {
        XCTAssertEqual(Core.libraryVideoCopy([resource(.video, "a/b:c.MOV")])?.name, "a_b_c.MOV")
        XCTAssertEqual(Core.libraryVideoCopy([resource(.video, nil)])?.name, "video.mov")
        XCTAssertEqual(Core.libraryVideoCopy([resource(.video, "  ")])?.name, "video.mov")
        XCTAssertEqual(Core.libraryVideoCopy([resource(.fullSizeVideo, "FullSizeRender.mov")])?.name, "video.mov",
                       "an edit with no recorded resource is not named after the rendering")
        XCTAssertEqual(Core.libraryVideoCopy([resource(.video, ".."), resource(.fullSizeVideo, "x.mov")])?.name, "video.mov")
    }

    func testLibraryVideoCopy_nothingToCopyWithoutAVideoResource() {
        XCTAssertNil(Core.libraryVideoCopy([]))
        XCTAssertNil(Core.libraryVideoCopy([resource(.other, "IMG_0001.AAE")]))
    }

    func testPhotoMimeType_onlyTheFourTypesAPreparedPhotoIsKeptAs() {
        XCTAssertEqual(Core.photoMimeType(fileExtension: "jpg"), "image/jpeg")
        XCTAssertEqual(Core.photoMimeType(fileExtension: "JPEG"), "image/jpeg")
        XCTAssertEqual(Core.photoMimeType(fileExtension: "png"), "image/png")
        XCTAssertEqual(Core.photoMimeType(fileExtension: "gif"), "image/gif")
        XCTAssertEqual(Core.photoMimeType(fileExtension: "webp"), "image/webp")
        for other in ["heic", "mov", "mp4", "pdf", ""] {
            XCTAssertNil(Core.photoMimeType(fileExtension: other), other)
        }
    }

    // MARK: - Pick-time refusal

    func testTooLarge_byKind_neverForAVideoThatWillBeConverted() {
        let max = Core.MaxBytes(image: 20 * Self.mib, video: 300 * Self.mib, file: 50 * Self.mib)
        XCTAssertFalse(Core.isTooLarge(kind: .image, size: 20 * Self.mib, needsExport: false, max: max), "at the limit")
        XCTAssertTrue(Core.isTooLarge(kind: .image, size: 20 * Self.mib + 1, needsExport: false, max: max))
        XCTAssertTrue(Core.isTooLarge(kind: .video, size: 300 * Self.mib + 1, needsExport: false, max: max))
        XCTAssertFalse(Core.isTooLarge(kind: .video, size: 2_000 * Self.mib, needsExport: true, max: max), "the conversion decides")
        XCTAssertTrue(Core.isTooLarge(kind: .file, size: 50 * Self.mib + 1, needsExport: false, max: max))
        XCTAssertFalse(Core.isTooLarge(kind: .file, size: 50 * Self.mib, needsExport: false, max: max))

        let none = Core.MaxBytes(image: 0, video: -1, file: 0)
        XCTAssertFalse(Core.isTooLarge(kind: .file, size: 1_000 * Self.mib, needsExport: false, max: none), "no ceiling sent")
    }

    func testSelectionLimit_isNeverBelowOne() {
        XCTAssertEqual(Core.selectionLimit(10), 10)
        XCTAssertEqual(Core.selectionLimit(1), 1)
        XCTAssertEqual(Core.selectionLimit(0), 1, "0 would mean unlimited to the picker")
        XCTAssertEqual(Core.selectionLimit(-3), 1)
    }

    // MARK: - Conversion

    private func facts(_ ext: String = "mp4", video: String? = "avc1", audio: String? = "aac ", width: Int = 1920, height: Int = 1080) -> Core.VideoFacts {
        Core.VideoFacts(fileExtension: ext, videoCodec: video, audioCodec: audio, width: width, height: height)
    }

    func testNeedsExport_unlessAlreadyAnH264Mp4Of1080pOrLess() {
        XCTAssertFalse(Core.needsExport(facts()), "H.264 + AAC mp4 at 1080p")
        XCTAssertFalse(Core.needsExport(facts(audio: nil)), "no audio")
        XCTAssertFalse(Core.needsExport(facts("MP4")), "extension case")
        XCTAssertFalse(Core.needsExport(facts(width: 1080, height: 1920)), "portrait 1080p")
        XCTAssertFalse(Core.needsExport(facts(width: 1280, height: 720)))
        XCTAssertFalse(Core.needsExport(facts(video: "avc3")))

        XCTAssertTrue(Core.needsExport(facts("mov")), "a QuickTime container, even with H.264")
        XCTAssertTrue(Core.needsExport(facts("m4v")))
        XCTAssertTrue(Core.needsExport(facts(video: "hvc1")), "HEVC")
        XCTAssertTrue(Core.needsExport(facts(video: nil)), "no video codec read")
        XCTAssertTrue(Core.needsExport(facts(audio: "ac-3")), "audio the web may not play")
        XCTAssertTrue(Core.needsExport(facts(width: 3840, height: 2160)), "4K")
        XCTAssertTrue(Core.needsExport(facts(width: 1920, height: 1088)), "a few rows over")
        XCTAssertTrue(Core.needsExport(facts(width: 1440, height: 1440)), "square, short side over 1080")
    }

    func testSizeStep_1080pThenOnce720p_thenTooLarge() {
        let limit = Core.exportLimitBytes
        XCTAssertEqual(limit, 300 * Self.mib)
        XCTAssertEqual(Core.sizeStep(preset: .p1080, estimatedBytes: 114 * Self.mib), .export(.p1080))
        XCTAssertEqual(Core.sizeStep(preset: .p1080, estimatedBytes: limit), .export(.p1080), "at the limit")
        XCTAssertEqual(Core.sizeStep(preset: .p1080, estimatedBytes: limit + 1), .stepDown(.p720))
        XCTAssertEqual(Core.sizeStep(preset: .p720, estimatedBytes: limit), .export(.p720))
        XCTAssertEqual(Core.sizeStep(preset: .p720, estimatedBytes: limit + 1), .tooLarge, "no lower preset")
        XCTAssertEqual(Core.sizeStep(preset: .p1080, estimatedBytes: nil), .export(.p1080), "no estimate: the web re-checks the result")
        XCTAssertEqual(Core.sizeStep(preset: .p1080, estimatedBytes: 0), .export(.p1080), "0 is no estimate")
    }

    func testExportStagingName_isHiddenAndUniquePerExport() {
        let first = Core.exportStagingName()
        let second = Core.exportStagingName()
        XCTAssertTrue(first.hasPrefix("."), "hidden")
        XCTAssertTrue(first.hasSuffix(".mp4"))
        XCTAssertNotEqual(first, second)
        let id = UUID()
        XCTAssertEqual(Core.exportStagingName(id), ".export-\(id.uuidString).mp4")
    }

    // MARK: - In-flight preparations

    /// Counts how often a job body ran.
    private actor Runs {
        private(set) var count = 0
        func add() -> Int {
            count += 1
            return count
        }
    }

    private struct Failure: Error, Equatable {}

    func testInFlight_aSecondCallForTheSameKeyJoinsTheRunningJob() async throws {
        let inFlight = Core.InFlight<Int>()
        let runs = Runs()
        let job: @Sendable () async throws -> Int = {
            let run = await runs.add()
            try await Task.sleep(nanoseconds: 200_000_000)
            return run
        }
        async let first = inFlight.run("clip", job)
        try await Task.sleep(nanoseconds: 50_000_000)
        async let second = inFlight.run("clip", job)
        let answers = try await [first, second]
        XCTAssertEqual(answers, [1, 1], "the retry gets the running job's answer")
        let ran = await runs.count
        XCTAssertEqual(ran, 1, "one export, not two")
        let left = await inFlight.count
        XCTAssertEqual(left, 0, "forgotten once finished")

        let again = try await inFlight.run("clip", job)
        XCTAssertEqual(again, 2, "a finished job runs afresh")
    }

    func testInFlight_differentKeysRunApart() async throws {
        let inFlight = Core.InFlight<Int>()
        let runs = Runs()
        let job: @Sendable () async throws -> Int = {
            try await Task.sleep(nanoseconds: 100_000_000)
            return await runs.add()
        }
        async let a = inFlight.run("a", job)
        async let b = inFlight.run("b", job)
        _ = try await [a, b]
        let ran = await runs.count
        XCTAssertEqual(ran, 2)
    }

    func testInFlight_aFailureReachesEveryCaller_andIsForgotten() async throws {
        let inFlight = Core.InFlight<Int>()
        let job: @Sendable () async throws -> Int = {
            try await Task.sleep(nanoseconds: 200_000_000)
            throw Failure()
        }
        async let first: Int = inFlight.run("clip", job)
        try await Task.sleep(nanoseconds: 50_000_000)
        async let second: Int = inFlight.run("clip", job)
        do {
            _ = try await first
            XCTFail("the first call should fail")
        } catch {
            XCTAssertEqual(error as? Failure, Failure())
        }
        do {
            _ = try await second
            XCTFail("the joined call should fail too")
        } catch {
            XCTAssertEqual(error as? Failure, Failure())
        }
        let left = await inFlight.count
        XCTAssertEqual(left, 0)
        let next = try await inFlight.run("clip") { 7 }
        XCTAssertEqual(next, 7)
    }

    // MARK: - Poster

    func testPosterTime_halfASecond_orTheFirstFrameOfAShorterVideo() {
        XCTAssertEqual(Core.posterTimeSeconds(durationSeconds: 60), 0.5)
        XCTAssertEqual(Core.posterTimeSeconds(durationSeconds: 0.51), 0.5)
        XCTAssertEqual(Core.posterTimeSeconds(durationSeconds: 0.5), 0)
        XCTAssertEqual(Core.posterTimeSeconds(durationSeconds: 0.2), 0)
        XCTAssertEqual(Core.posterTimeSeconds(durationSeconds: .nan), 0)
    }

    func testPosterQuality_stepsDownFrom0point7UntilItFits() {
        var tried: [Double] = []
        let fitting = Core.firstFitting(maxBytes: 200_000) { quality in
            tried.append(quality)
            return Data(count: Int(quality * 500_000))   // 0.7 → 350 KB … 0.4 → 200 KB
        }
        XCTAssertEqual(tried, [0.7, 0.6, 0.5, 0.4])
        XCTAssertEqual(fitting?.count, 200_000)
        XCTAssertNil(Core.firstFitting(maxBytes: 10) { _ in Data(count: 11) }, "nothing fits: no poster")
        XCTAssertNil(Core.firstFitting { _ in nil }, "cannot encode: no poster")
        XCTAssertEqual(Core.posterMaxBytes, 200_000)
        XCTAssertEqual(Core.posterLongSide, 400)
    }

    // MARK: - Remote video frame

    private let signed = "https://bucket.s3.ap-northeast-2.amazonaws.com/v/clip.mp4?X-Amz-Signature=abc"

    func testFrameRequest_acceptsAnHttpsUrlWithAHost_andZeroOrMoreMs() {
        let request = Core.frameRequest(url: signed, atMs: 500, maxEdge: 400)
        XCTAssertEqual(request?.url.absoluteString, signed)
        XCTAssertEqual(request?.atMs, 500)
        XCTAssertEqual(request?.maxEdge, 400)
        XCTAssertNotNil(Core.frameRequest(url: signed, atMs: 0, maxEdge: 400), "the first frame may be asked for")
        XCTAssertNotNil(Core.frameRequest(url: "HTTPS://example.com/a.mp4", atMs: 0, maxEdge: 1), "scheme case")
    }

    func testFrameRequest_refusesAnythingButHttps() {
        for url in ["http://example.com/a.mp4", "file:///var/mobile/a.mp4", "ph://ABC/L0/001", "https:///a.mp4", "https://", "", "not a url"] {
            XCTAssertNil(Core.frameRequest(url: url, atMs: 500, maxEdge: 400), url)
        }
    }

    func testFrameRequest_refusesNumbersThatAreNotFiniteOrInRange() {
        XCTAssertNil(Core.frameRequest(url: signed, atMs: -1, maxEdge: 400))
        XCTAssertNil(Core.frameRequest(url: signed, atMs: .nan, maxEdge: 400))
        XCTAssertNil(Core.frameRequest(url: signed, atMs: .infinity, maxEdge: 400))
        XCTAssertNil(Core.frameRequest(url: signed, atMs: 500, maxEdge: 0))
        XCTAssertNil(Core.frameRequest(url: signed, atMs: 500, maxEdge: -400))
        XCTAssertNil(Core.frameRequest(url: signed, atMs: 500, maxEdge: .nan))
        XCTAssertNil(Core.frameRequest(url: signed, atMs: 500, maxEdge: .infinity))
    }

    func testFrameTime_asAsked_orTheFirstFrameOfAVideoNoLongerThanThat() {
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: 60_000), 500)
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: 501), 500)
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: 500), 0, "the poster's rule: not longer is shorter")
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: 200), 0)
        XCTAssertEqual(Core.frameTimeMs(atMs: 0, durationMs: 200), 0)
    }

    func testFrameTime_unknownDurationLeavesTheTimeAsAsked() {
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: nil), 500)
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: .nan), 500)
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: .infinity), 500)
        XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: 0), 500)
    }

    func testFrameTime_matchesThePosterRuleAtHalfASecond() {
        for duration in [0.2, 0.5, 0.51, 60] {
            XCTAssertEqual(Core.frameTimeMs(atMs: 500, durationMs: duration * 1000) / 1000, Core.posterTimeSeconds(durationSeconds: duration), "\(duration) s")
        }
    }

    func testFrameReads_twoAtOnce_givingUpAfterTwentySeconds() {
        XCTAssertEqual(Core.frameReadsAtOnce, 2)
        XCTAssertEqual(Core.frameTimeoutSeconds, 20)
    }

    func testDisplaySize_appliesTheTracksRotation() {
        let natural = CGSize(width: 1920, height: 1080)
        XCTAssertTrue(Core.displaySize(natural: natural, transform: .identity) == (1920, 1080))
        XCTAssertTrue(Core.displaySize(natural: natural, transform: CGAffineTransform(rotationAngle: .pi / 2)) == (1080, 1920))
        XCTAssertTrue(Core.displaySize(natural: natural, transform: CGAffineTransform(rotationAngle: -.pi / 2)) == (1080, 1920))
        XCTAssertTrue(Core.displaySize(natural: natural, transform: CGAffineTransform(rotationAngle: .pi)) == (1920, 1080))
    }

    func testOrientedPixelSize_swapsForQuarterTurns() {
        XCTAssertTrue(Core.orientedPixelSize(width: 4032, height: 3024, exifOrientation: 6) == (3024, 4032))
        XCTAssertTrue(Core.orientedPixelSize(width: 4032, height: 3024, exifOrientation: 8) == (3024, 4032))
        XCTAssertTrue(Core.orientedPixelSize(width: 4032, height: 3024, exifOrientation: 1) == (4032, 3024))
        XCTAssertTrue(Core.orientedPixelSize(width: 4032, height: 3024, exifOrientation: 3) == (4032, 3024))
        XCTAssertTrue(Core.orientedPixelSize(width: 4032, height: 3024, exifOrientation: nil) == (4032, 3024))
    }
}
