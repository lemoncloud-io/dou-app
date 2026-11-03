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
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00]), fileName: "photos.zip"), .zip)
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
        XCTAssertNil(DownloadFiles.exportFamily(Data(Array("RIFF".utf8) + [0, 0, 0, 0] + Array("AVI ".utf8)), fileName: "a.wav"), "a RIFF that is not WAVE")
        XCTAssertNil(DownloadFiles.exportFamily(Data([0xFF, 0xC0, 0x00]), fileName: "a.mp3"), "not an MPEG frame sync")
        XCTAssertNil(DownloadFiles.exportFamily(Data([0xFF]), fileName: "a.mp3"), "half a frame sync")
        XCTAssertNil(DownloadFiles.exportFamily(Data("Ogg".utf8), fileName: "a.ogg"), "half an Ogg capture pattern")
    }

    // MARK: - Audio families

    private static func mpeg4(_ brand: String) -> Data {
        Data([0, 0, 0, 0x20] + Array("ftyp\(brand)".utf8) + [0, 0, 0, 0])
    }

    func testFamilies_audioIsReadFromTheBytes() {
        XCTAssertEqual(DownloadFiles.exportFamily(Data(Array("ID3".utf8) + [0x04, 0x00, 0x00]), fileName: "song.mp3"), .audio(.mp3), "an ID3 tag")
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0xFF, 0xFB, 0x90, 0x64]), fileName: "song.mp3"), .audio(.mp3), "a bare MPEG-1 Layer III frame")
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0xFF, 0xF3, 0x84, 0x64]), fileName: "song"), .audio(.mp3), "an MPEG-2 frame, with no name")
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0xFF, 0xE3, 0x18, 0xC4]), fileName: "song.mp3"), .audio(.mp3), "an MPEG-2.5 frame")
        let wav = Data(Array("RIFF".utf8) + [0x24, 0x08, 0, 0] + Array("WAVEfmt ".utf8))
        XCTAssertEqual(DownloadFiles.exportFamily(wav, fileName: "take.wav"), .audio(.wav))
        XCTAssertEqual(DownloadFiles.exportFamily(Data(Array("OggS".utf8) + [0, 2]), fileName: "clip.ogg"), .audio(.ogg))
        XCTAssertEqual(DownloadFiles.exportFamily(Data(Self.png), fileName: "cover.mp3"), .image(.png), "the bytes still win over the name")
    }

    func testFamilies_anM4aIsAudio_byItsBrandOrItsName_andAnMp4StaysAVideo() {
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("M4A "), fileName: "voice-20261102-142530.m4a"), .audio(.m4a), "what the recorder writes")
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("M4A "), fileName: "voice"), .audio(.m4a), "the brand alone")
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("M4A "), fileName: "voice.mp4"), .audio(.m4a), "the brand wins over the name")
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("isom"), fileName: "memo.m4a"), .audio(.m4a), "a generic brand named .m4a")
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("isom"), fileName: "memo.M4A"), .audio(.m4a))
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("isom"), fileName: "clip.mp4"), .isoBmff, "a generic brand named .mp4 is a video")
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("mp42"), fileName: "clip.mp4"), .isoBmff)
        XCTAssertEqual(DownloadFiles.exportFamily(Self.mpeg4("M4V "), fileName: "clip.m4v"), .isoBmff)
    }

    /// The photo library takes an image or `isoBmff` and nothing else (`MediaExport.saveToPhotoLibrary`),
    /// so no audio file — an M4A least of all, which is an MPEG-4 file like a video — can reach it.
    func testFamilies_noAudioIsAPhotoLibraryFamily() {
        let audio: [(Data, String)] = [
            (Self.mpeg4("M4A "), "voice.m4a"),
            (Self.mpeg4("isom"), "memo.m4a"),
            (Data(Array("ID3".utf8) + [4, 0, 0]), "song.mp3"),
            (Data([0xFF, 0xFB, 0x90, 0x64]), "song.mp3"),
            (Data(Array("RIFF".utf8) + [0, 0, 0, 0] + Array("WAVE".utf8)), "take.wav"),
            (Data(Array("OggS".utf8) + [0]), "clip.ogg"),
        ]
        for (head, name) in audio {
            let family = DownloadFiles.exportFamily(head, fileName: name)
            switch family {
            case .audio: break
            default: XCTFail("\(name) is \(String(describing: family)), not audio")
            }
        }
    }

    func testFamilies_aTextFileIsNotTakenForABareMp3Frame() {
        XCTAssertEqual(DownloadFiles.exportFamily(Data([0xFF, 0xFE, 0x41, 0xAC]), fileName: "notes.txt"), .text, "a UTF-16 byte order mark named .txt")
    }

    // MARK: - Server formats

    func testServerFormats_coverTheSeventeenFormats_withTheWebsTypes() {
        XCTAssertEqual(Set(DownloadFiles.serverFormats.keys), [
            "png", "jpg", "jpeg", "gif", "webp", "mp4", "pdf", "docx", "xlsx", "pptx", "hwp", "hwpx", "txt", "zip",
            "mp3", "m4a", "wav", "ogg",
        ])
        XCTAssertEqual(DownloadFiles.serverFormats["mp3"], "audio/mpeg")
        XCTAssertEqual(DownloadFiles.serverFormats["m4a"], "audio/mp4")
        XCTAssertEqual(DownloadFiles.serverFormats["wav"], "audio/wav")
        XCTAssertEqual(DownloadFiles.serverFormats["ogg"], "audio/ogg")
        XCTAssertEqual(DownloadFiles.AudioType.m4a.mimeType, DownloadFiles.serverFormats["m4a"])
        XCTAssertEqual(DownloadFiles.serverFormats["zip"], "application/zip")
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
        for ext in ["png", "jpg", "jpeg", "gif", "webp", "mp4", "pdf", "docx", "xlsx", "pptx", "txt", "zip"] {
            let type = try XCTUnwrap(UTType(filenameExtension: ext), ext)
            XCTAssertFalse(type.isDynamic, "\(ext) is a type the system knows")
            XCTAssertEqual(type.preferredMIMEType, DownloadFiles.serverFormats[ext], ext)
        }
        for ext in ["hwp", "hwpx"] {
            let type = try XCTUnwrap(UTType(filenameExtension: ext, conformingTo: .data), ext)
            XCTAssertTrue(type.conforms(to: .data), ext)
        }
    }

    /// Each audio extension is an audio type to the share sheet and QuickLook. The system's names for
    /// M4A and WAV predate the server's (`audio/x-m4a`, `audio/vnd.wave`); only the kind matters there.
    func testTheSystemTypesEachAudioExtension_asAudio() throws {
        for ext in ["mp3", "m4a", "wav", "ogg"] {
            let type = try XCTUnwrap(UTType(filenameExtension: ext), ext)
            XCTAssertFalse(type.isDynamic, "\(ext) is a type the system knows")
            XCTAssertTrue(type.conforms(to: .audio), ext)
            XCTAssertFalse(type.conforms(to: .movie), "\(ext) is not a video")
        }
        XCTAssertEqual(UTType(filenameExtension: "mp3")?.preferredMIMEType, DownloadFiles.serverFormats["mp3"])
        XCTAssertEqual(UTType(filenameExtension: "ogg")?.preferredMIMEType, DownloadFiles.serverFormats["ogg"])
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
            ("Photos 2026.ZIP", "Photos 2026.zip"),
            ("voice-20261102-142530.M4A", "voice-20261102-142530.m4a"),
            ("노래.mp3", "노래.mp3"),
            ("take.wav", "take.wav"),
            ("clip.Ogg", "clip.ogg"),
        ]
        for (name, expected) in kept {
            XCTAssertEqual(DownloadFiles.saveFileName(name), expected, name)
        }
        for refused in ["", "report", "setup.exe", "page.html", "archive.7z", "track.aac", "track.flac", "book.m4b", ".pdf", "  .pdf", "notes.", "x.part"] {
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
