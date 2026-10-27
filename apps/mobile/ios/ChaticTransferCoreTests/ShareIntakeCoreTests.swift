import Foundation
import XCTest

/// The share-intake rules that need no UIKit: the id, the manifest's item paths, what a shared item is
/// taken as, its name, and its text. `Bridges/ShareIntake/Core/ShareIntakeCore.swift` reaches this
/// bundle as an explicit file reference, like the attachment-picker core does.
final class ShareIntakeCoreTests: XCTestCase {
    private typealias Core = ShareIntakeCore

    // MARK: - Id

    func testIntakeId_onlyAUuid_lowerCased() {
        XCTAssertEqual(Core.intakeId("3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b"), "3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b")
        XCTAssertEqual(Core.intakeId("3F2B8C1E-9A4D-4E7F-8B21-0C5D6E7F8A9B"), "3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b")
        XCTAssertNil(Core.intakeId(""))
        XCTAssertNil(Core.intakeId("../ShareIntake"))
        XCTAssertNil(Core.intakeId("3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b/.."))
    }

    // MARK: - Manifest paths

    func testItemFile_onlySlotAndNameInsideTheShare() {
        let folder = URL(fileURLWithPath: "/group/ShareIntake/io.chatic.dou/3f2b", isDirectory: true)
        XCTAssertEqual(Core.itemFile("0/IMG_1.jpg", in: folder)?.path, "/group/ShareIntake/io.chatic.dou/3f2b/0/IMG_1.jpg")
        XCTAssertEqual(Core.itemFile("9/a b.pdf", in: folder)?.path, "/group/ShareIntake/io.chatic.dou/3f2b/9/a b.pdf")
        for path in ["", "a.png", "0/", "/0/a.png", "0/b/c.png", "../a.png", "0/..", "0/../../etc", "./a.png", "0/."] {
            XCTAssertNil(Core.itemFile(path, in: folder), path)
        }
    }

    func testManifest_readsWhatTheExtensionWrites() throws {
        var manifest = Core.Manifest()
        manifest.items = [.init(path: "0/a.png", name: "a.png", type: "public.png")]
        manifest.refused = [.init(name: "b.heic", kind: "image", reason: "unreadable")]
        manifest.text = "https://example.com"
        let read = try JSONDecoder().decode(Core.Manifest.self, from: JSONEncoder().encode(manifest))
        XCTAssertEqual(read, manifest)
        XCTAssertEqual(read.version, 1)
        XCTAssertEqual(Core.readManifest(try JSONEncoder().encode(manifest)), manifest)
    }

    func testReadManifest_onlyAVersionThisAppKnows() throws {
        var newer = Core.Manifest()
        newer.version = 2
        XCTAssertNil(Core.readManifest(try JSONEncoder().encode(newer)))
        XCTAssertNil(Core.readManifest(Data("{\"version\":1}".utf8)))
        XCTAssertNil(Core.readManifest(Data("not json".utf8)))
    }

    // MARK: - What a shared item is taken as

    func testContent_aWebLinkOrPlainTextIsText() {
        XCTAssertEqual(Core.content(of: ["public.url"]), .text("public.url"))
        XCTAssertEqual(Core.content(of: ["public.plain-text"]), .text("public.plain-text"))
        XCTAssertEqual(Core.content(of: ["public.utf8-plain-text", "public.plain-text"]), .text("public.plain-text"))
    }

    func testContent_aTextFileIsAFile() {
        XCTAssertEqual(Core.content(of: ["public.file-url", "public.plain-text"]), .file(.file, ["public.plain-text"]))
    }

    func testContent_aPhotoInAServerFormatGoesAsStored() {
        XCTAssertEqual(Core.content(of: ["public.png"]), .file(.image, ["public.png", "public.jpeg"]))
        XCTAssertEqual(Core.content(of: ["public.jpeg"]), .file(.image, ["public.jpeg"]))
    }

    func testContent_anyOtherPhotoIsAskedForAsJpegFirst() {
        XCTAssertEqual(Core.content(of: ["public.heic"]), .file(.image, ["public.jpeg", "public.heic"]))
        // A Live Photo's bundle is not an image file; its still is taken.
        XCTAssertEqual(Core.content(of: ["com.apple.live-photo-bundle", "public.heic"]), .file(.image, ["public.jpeg", "public.heic"]))
    }

    func testContent_aVideoOrADocument() {
        XCTAssertEqual(Core.content(of: ["com.apple.quicktime-movie"]), .file(.video, ["com.apple.quicktime-movie"]))
        XCTAssertEqual(Core.content(of: ["com.adobe.pdf"]), .file(.file, ["com.adobe.pdf"]))
    }

    func testContent_nothingUsable() {
        XCTAssertNil(Core.content(of: []))
        XCTAssertNil(Core.content(of: ["public.file-url"]))
    }

    // MARK: - Names

    func testFileName_theSuggestedNameWithTheHandedOverExtension() {
        XCTAssertEqual(Core.fileName(suggested: "IMG_0001", loadedName: "x.jpeg", type: "public.jpeg"), "IMG_0001.jpeg")
        XCTAssertEqual(Core.fileName(suggested: "IMG_0001.HEIC", loadedName: "y.jpg", type: "public.jpeg"), "IMG_0001.jpg")
        XCTAssertEqual(Core.fileName(suggested: nil, loadedName: "report.pdf", type: "com.adobe.pdf"), "report.pdf")
    }

    func testFileName_neverAPath() {
        XCTAssertEqual(Core.fileName(suggested: "a/b:c", loadedName: "x.png", type: "public.png"), "a_b_c.png")
        XCTAssertEqual(Core.fileName(suggested: "..", loadedName: "..", type: "public.data"), "file")
        XCTAssertEqual(Core.fileName(suggested: "", loadedName: "", type: "public.png"), "file.png")
    }

    // MARK: - Text

    func testSharedText_aWebLinkOrText_neverADevicePath() {
        XCTAssertEqual(Core.sharedText(URL(string: "https://example.com/a")), "https://example.com/a")
        XCTAssertNil(Core.sharedText(URL(fileURLWithPath: "/private/var/mobile/x.txt")))
        XCTAssertEqual(Core.sharedText("  hello \n"), "hello")
        XCTAssertEqual(Core.sharedText(Data("hi".utf8)), "hi")
        XCTAssertNil(Core.sharedText("   "))
        XCTAssertNil(Core.sharedText(nil))
    }
}
