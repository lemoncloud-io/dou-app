import UniformTypeIdentifiers
import XCTest

/// Which downloaded files leave the app, and as what: the byte families media export takes, the
/// server's formats by extension, and `SaveFile`'s name check — all in `DownloadFiles`.
final class MediaExportRulesTests: XCTestCase {
    private static let png: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]

    // MARK: - Export families

    func testFamilies_areReadFromTheBytes_andOnlyTextNeedsTheName() {
        XCTAssertEqual(DownloadFiles.exportFamily(Data(Self.png), fileName: "a.pdf"), .image(.png), "the bytes win over the name")
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0, 0, 0, 0x18] + Array("ftypmp42".utf8)), fileName: "clip.mp4"), .isoBmff)
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0, 0, 0, 0x14] + Array("ftypqt  ".utf8)), fileName: "clip"), .isoBmff)
        XCTAssertEqual(DownloadFiles.exportFamily(Data("%PDF-1.7\n".utf8), fileName: "report"), .pdf)
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]), fileName: "a.docx"), .zip)
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0x50, 0x4B, 0x03, 0x04]), fileName: "a.hwpx"), .zip)
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00]), fileName: "a.hwp"), .ole2)
        XCTAssertEqual(DownloadFiles.exportFamily(Data("회의록\nline two".utf8), fileName: "notes.TXT"), .text)
        XCTAssertEqual(DownloadFiles.exportFamily(Data(), fileName: "empty.txt"), .text, "an empty text file is still text")
    }

    func testFamilies_refuseEverythingElse() {
        XCTAssertNil(DownloadFiles.exportFamily(Data("plain words".utf8), fileName: "notes.md"), "text without a .txt name")
        XCTAssertNil(DownloadFiles.exportFamily(Data("abc\u{0}def".utf8), fileName: "notes.txt"), "a NUL means it is not text")
        let lateNul = Data(repeating: 0x41, count: DownloadFiles.familySniffBytes) + Data([0])
        XCTAssertEqual(DownloadFiles.exportFamily(lateNul, fileName: "long.txt"), .text, "only the first 4 KB are read")
        XCTAssertNil(DownloadFiles.exportFamily(Data("<!doctype html><html>".utf8), fileName: "page.html"))
        XCTAssertNil(DownloadFiles.exportFamily(Data([0x50, 0x4B, 0x05, 0x06]), fileName: "empty.zip"), "an empty ZIP's end record")
        XCTAssertNil(DownloadFiles.exportFamily(Data([0xD0, 0xCF, 0x11, 0xE0]), fileName: "a.hwp"), "half an OLE2 header")
        XCTAssertNil(DownloadFiles.exportFamily(Data([0, 0, 0, 0x18] + Array("ftyx".utf8)), fileName: "a.mp4"))
        XCTAssertNil(DownloadFiles.exportFamily(Data("ftyp".utf8), fileName: "a.mp4"), "ftyp at the wrong offset")
    }

    // MARK: - Server formats

    func testServerFormats_coverTheTwelveFormats_withTheWebsTypes() {
        XCTAssertEqual(Set(DownloadFiles.serverFormats.keys), [
            "png", "jpg", "jpeg", "gif", "webp", "mp4", "pdf", "docx", "xlsx", "pptx", "hwp", "hwpx", "txt",
        ])
        XCTAssertEqual(DownloadFiles.serverFormats["docx"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        XCTAssertEqual(DownloadFiles.serverFormats["hwp"], "application/x-hwp")
        XCTAssertEqual(DownloadFiles.serverFormats["hwpx"], "application/hwp+zip")
        XCTAssertEqual(DownloadFiles.serverExtension(of: "Report.PDF"), "pdf")
        XCTAssertEqual(DownloadFiles.serverExtension(of: "archive.tar.gz"), "gz")
        XCTAssertNil(DownloadFiles.serverExtension(of: ".hidden"))
        XCTAssertNil(DownloadFiles.serverExtension(of: "trailing."))
        XCTAssertNil(DownloadFiles.serverExtension(of: "none"))
    }

    /// The share sheet, QuickLook and the export sheet type a file by its URL's extension. This pins
    /// that the system reads each format the server stores as that format — a ZIP named `.docx` is a
    /// Word document to them — and that HWP and HWPX at least become a data type the picker can match.
    func testTheSystemTypesEachServerExtension_asTheServerDoes() throws {
        for ext in ["png", "jpg", "jpeg", "gif", "webp", "mp4", "pdf", "docx", "xlsx", "pptx", "txt"] {
            let type = try XCTUnwrap(UTType(filenameExtension: ext), ext)
            XCTAssertFalse(type.isDynamic, "\(ext) is a type the system knows")
            XCTAssertEqual(type.preferredMIMEType, DownloadFiles.serverFormats[ext], ext)
        }
        for ext in ["hwp", "hwpx"] {
            let type = try XCTUnwrap(UTType(filenameExtension: ext, conformingTo: .data), ext)
            XCTAssertTrue(type.conforms(to: .data), ext)
        }
    }

    // MARK: - SaveFile names

    func testSaveFileName_cleansTheName_andKeepsOnlyServerFormats() {
        let kept: [(String, String)] = [
            ("보고서.hwp", "보고서.hwp"),
            ("회의록 v1.2.pdf", "회의록 v1.2.pdf"),
            ("Report.PDF", "Report.pdf"),
            ("../../etc/passwd.txt", "etcpasswd.txt"),
            ("a/b\\c.docx", "abc.docx"),
            ("pho\u{0}to\u{1F}\u{85}.jpg", "photo.jpg"),
            ("a:b*c?\"<>|.xlsx", "a_b_c_____.xlsx"),
            ("  .slides.pptx. ", "slides.pptx"),
            ("clip.MP4", "clip.mp4"),
            ("scan.jpeg", "scan.jpeg"),
            ("board.hwpx", "board.hwpx"),
            ("a.png", "a.png"),
            ("a.gif", "a.gif"),
            ("a.webp", "a.webp"),
        ]
        for (name, expected) in kept {
            XCTAssertEqual(DownloadFiles.saveFileName(name), expected, name)
        }
        for refused in ["", "report", "setup.exe", "page.html", "archive.zip", ".pdf", "  .pdf", "notes.", "x.part"] {
            XCTAssertNil(DownloadFiles.saveFileName(refused), refused)
        }
    }

    func testSaveFileName_cutsTheBaseToFit_onACharacterBoundary() throws {
        let long = String(repeating: "가", count: 100) + ".pdf"   // 300 bytes of base
        let name = try XCTUnwrap(DownloadFiles.saveFileName(long))
        XCTAssertLessThanOrEqual(name.utf8.count, DownloadFiles.maxSaveNameBytes)
        XCTAssertTrue(name.hasSuffix(".pdf"))
        XCTAssertEqual(name, String(repeating: "가", count: 65) + ".pdf", "195 bytes of budget hold 65 three-byte characters")
        XCTAssertEqual(DownloadFiles.saveFileName(String(repeating: "a", count: 194) + " .txt"), String(repeating: "a", count: 194) + ".txt")
    }
}
