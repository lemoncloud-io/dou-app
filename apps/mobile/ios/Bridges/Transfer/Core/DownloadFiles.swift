import CryptoKit
import Foundation

/// Rules for the folder downloads land in, shared by the transfer (which writes it) and media export
/// (which reads it): where a download's file goes, what it is called, whether its bytes are an image,
/// which files may leave the app, and when an old file is swept.
///
/// The Android shell implements the same rules in `DownloadFiles.kt`; the numbered core tests pin
/// the two to the same answers.
///
/// Layout, under the app's caches directory:
///
///     transfer-download/
///       └ <folderName(transferId)>/
///           ├ photo.png.part   being received — never exported
///           └ photo.png        committed — what save and share accept
enum DownloadFiles {
    static let folder = "transfer-download"
    static let partSuffix = ".part"
    static let defaultBaseName = "image"
    static let maxBaseNameLength = 60
    /// How many leading bytes `sniffImage` needs; a shorter file is never an image here.
    static let sniffBytes = 12
    /// A transfer folder whose last change is older than this is swept at the next download start.
    static let sweepAgeMs: Int64 = 24 * 60 * 60 * 1000

    private static let maxExtensionLength = 10
    /// Characters FAT-style storage refuses in a name. Android replaces them for its public Pictures
    /// copy, and iOS does the same so both platforms name a file alike.
    private static let unsafeCharacters: Set<Unicode.Scalar> = [":", "*", "?", "\"", "<", ">", "|"]

    // MARK: - Commit (U17)

    /// Whether a download's body becomes a file. Only a 2xx does: any other status carries an error
    /// document — S3 answers an expired signature with a 403 XML body — which must never be saved
    /// under an image's name.
    static func keepsBody(_ httpStatus: Int) -> Bool { (200...299).contains(httpStatus) }

    /// The progress denominator from a declared length; unknown (-1, as for a chunked reply) is 0.
    static func totalBytes(_ contentLength: Int64) -> Int64 { contentLength > 0 ? contentLength : 0 }

    // MARK: - Where a download goes

    /// The folder a transfer writes into. The id is chosen by the web, which is loaded remotely, so it
    /// is hashed rather than used as a path segment: an id such as `../../databases` must not be able
    /// to name a folder of its own.
    static func folderName(_ transferId: String) -> String {
        SHA256.hash(data: Data(transferId.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Names (U21)

    /// A sanitised name hint: the base, and the extension the hint carried, if any (lower case).
    struct NameParts: Equatable {
        let base: String
        let ext: String?
    }

    /// Cleans a name hint from the web: keeps only the last path segment, drops control characters,
    /// replaces characters some storage refuses, trims spaces and dots at either end, splits off a
    /// short alphanumeric extension, and cuts the base to `maxBaseNameLength` code points. An empty
    /// result becomes `defaultBaseName`. Applying it to its own `fileName` output changes nothing.
    static func nameParts(_ hint: String?) -> NameParts {
        let raw = hint ?? ""
        let segment = raw.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? ""
        let lastSegment = segment.split(separator: "\\", omittingEmptySubsequences: false).last.map(String.init) ?? ""

        var scalars = String.UnicodeScalarView()
        for scalar in lastSegment.unicodeScalars {
            if isControl(scalar) { continue }
            scalars.append(unsafeCharacters.contains(scalar) ? "_" : scalar)
        }
        let cleaned = withoutPartSuffix(trimEdges(String(scalars)))

        // Work on scalars throughout so the answer matches Android's code-point arithmetic.
        let all = Array(cleaned.unicodeScalars)
        var ext: String?
        var baseScalars = all
        if let dot = all.lastIndex(of: "."), dot > 0 {
            let suffix = all[(dot + 1)...]
            if (1...maxExtensionLength).contains(suffix.count), suffix.allSatisfy(isAsciiAlphanumeric) {
                ext = String(String.UnicodeScalarView(suffix)).lowercased()
                baseScalars = Array(all[..<dot])
            }
        }
        let trimmedBase = Array(trimEdges(String(String.UnicodeScalarView(baseScalars))).unicodeScalars)
        let base = trimEdges(String(String.UnicodeScalarView(trimmedBase.prefix(maxBaseNameLength))))
        return NameParts(base: base.isEmpty ? defaultBaseName : base, ext: ext)
    }

    /// The committed name: the extension the bytes show when they are a known image, else the hint's.
    static func fileName(_ parts: NameParts, sniffed: ImageType? = nil) -> String {
        guard let ext = sniffed?.fileExtension ?? parts.ext else { return parts.base }
        return "\(parts.base).\(ext)"
    }

    /// The in-progress name. It keeps the hint so a relaunched process can still name the file.
    static func partName(_ parts: NameParts) -> String { fileName(parts) + partSuffix }

    /// `name`, or `stem (1).ext`, `stem (2).ext`, … — the first one `taken` says is free.
    static func uniqueName(_ name: String, taken: (String) -> Bool) -> String {
        if !taken(name) { return name }
        let stem: String
        let ext: String
        if let dot = name.lastIndex(of: "."), dot > name.startIndex {
            stem = String(name[..<dot])
            ext = String(name[dot...])
        } else {
            stem = name
            ext = ""
        }
        var index = 1
        while true {
            let candidate = "\(stem) (\(index))\(ext)"
            if !taken(candidate) { return candidate }
            index += 1
        }
    }

    // MARK: - Image type (U20)

    enum ImageType: String {
        case png = "image/png"
        case jpeg = "image/jpeg"
        case gif = "image/gif"
        case webp = "image/webp"

        var mimeType: String { rawValue }

        var fileExtension: String {
            switch self {
            case .png: return "png"
            case .jpeg: return "jpg"
            case .gif: return "gif"
            case .webp: return "webp"
            }
        }
    }

    /// The image type a file's first bytes show, or `nil`. The response's `Content-Type` is what the
    /// uploader declared, so the bytes decide — the same way the desktop app names a saved image.
    static func sniffImage(_ head: Data) -> ImageType? {
        let bytes = [UInt8](head.prefix(sniffBytes))
        guard bytes.count >= sniffBytes else { return nil }
        func matches(_ offset: Int, _ expected: [UInt8]) -> Bool {
            Array(bytes[offset..<(offset + expected.count)]) == expected
        }
        func ascii(_ offset: Int, _ text: String) -> Bool { matches(offset, Array(text.utf8)) }
        if matches(0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return .png }
        if matches(0, [0xFF, 0xD8, 0xFF]) { return .jpeg }
        if ascii(0, "GIF87a") || ascii(0, "GIF89a") { return .gif }
        if ascii(0, "RIFF") && ascii(8, "WEBP") { return .webp }
        return nil
    }

    // MARK: - Export families

    /// How many leading bytes `exportFamily` reads: enough to look for a NUL in a text file.
    static let familySniffBytes = 4096

    /// The byte families a downloaded file may leave the app as. A family only gates: DOCX, XLSX, PPTX
    /// and HWPX are all ZIP files, so which of them a file is comes from its name (`serverFormats`).
    enum ExportFamily: Equatable {
        case image(ImageType)
        /// MP4 and the rest of its family: bytes 4 to 7 are `ftyp`.
        case isoBmff
        case pdf
        /// DOCX, XLSX, PPTX, HWPX, and a plain ZIP archive.
        case zip
        /// HWP, a Compound File Binary.
        case ole2
        /// A `.txt` name and no NUL in the first `familySniffBytes`.
        case text
    }

    /// The family a file's first bytes (up to `familySniffBytes`) and its name show, or `nil`.
    static func exportFamily(_ head: Data, fileName: String) -> ExportFamily? {
        if let image = sniffImage(head) { return .image(image) }
        let bytes = [UInt8](head.prefix(familySniffBytes))
        func matches(_ offset: Int, _ expected: [UInt8]) -> Bool {
            bytes.count >= offset + expected.count && Array(bytes[offset..<(offset + expected.count)]) == expected
        }
        if matches(4, Array("ftyp".utf8)) { return .isoBmff }
        if matches(0, Array("%PDF".utf8)) { return .pdf }
        if matches(0, [0x50, 0x4B, 0x03, 0x04]) { return .zip }
        if matches(0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) { return .ole2 }
        // Text has no signature: the name says it is one, and binary bytes would say it is not.
        if serverExtension(of: fileName) == "txt", !bytes.contains(0) { return .text }
        return nil
    }

    /// The formats the shell saves, by file extension, with the content type each stands for — the
    /// table the web judges a picked file by, without its ZIP archive. On iOS the share sheet,
    /// QuickLook and the export sheet type a file by its URL's extension, so the name is what makes a
    /// ZIP a DOCX.
    static let serverFormats: [String: String] = [
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "mp4": "video/mp4",
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "hwp": "application/x-hwp",
        "hwpx": "application/hwp+zip",
        "txt": "text/plain",
    ]

    /// The lower-case text after the last dot, unless that dot is the first or last character — the
    /// server's rule, which the web applies too.
    static func serverExtension(of name: String) -> String? {
        guard let dot = name.lastIndex(of: "."), dot > name.startIndex, name.index(after: dot) < name.endIndex else { return nil }
        return String(name[name.index(after: dot)...]).lowercased()
    }

    /// The longest name, in UTF-8 bytes, `SaveFile` keeps a file under; file systems stop at 255.
    static let maxSaveNameBytes = 200

    /// The name `SaveFile` keeps a document under, or `nil` when it may not be saved. The name comes
    /// from the web, so it is checked once more: path separators and control characters are removed,
    /// characters some storage refuses replaced with `_`, spaces and dots trimmed at either end, the
    /// extension lowered and the base cut to fit. A name whose extension is not one the shell saves —
    /// none, `.exe`, `.html`, `.zip` — is refused rather than renamed: the person would not recognise what it became.
    /// Android applies the same steps.
    static func saveFileName(_ name: String) -> String? {
        var scalars = String.UnicodeScalarView()
        for scalar in name.unicodeScalars {
            if isControl(scalar) || scalar == "/" || scalar == "\\" { continue }
            scalars.append(unsafeCharacters.contains(scalar) ? "_" : scalar)
        }
        let cleaned = trimEdges(String(scalars))
        guard let ext = serverExtension(of: cleaned), serverFormats[ext] != nil,
              let dot = cleaned.lastIndex(of: ".")
        else { return nil }
        let base = trimEdges(String(cleaned[..<dot]))
        guard !base.isEmpty else { return nil }
        var cut = String.UnicodeScalarView()
        var bytes = 0
        for scalar in base.unicodeScalars {
            let size = String(scalar).utf8.count
            if bytes + size > maxSaveNameBytes - ext.count - 1 { break }
            bytes += size
            cut.append(scalar)
        }
        var kept = String(cut)
        while let last = kept.unicodeScalars.last, last == " " || last == "." { kept.unicodeScalars.removeLast() }
        return "\(kept).\(ext)"
    }

    // MARK: - What may leave the app (U19)

    /// The answer to "may this URI be saved or shared?".
    enum ExportCheck: Equatable {
        /// Inside the download folder and committed; the resolved real file.
        case accepted(URL)
        /// Not a file the shell hands out: another scheme, outside the folder, the folder, a `.part`.
        case invalid(String)
        /// Inside the folder but gone — the OS may have cleared the caches.
        case missing
    }

    /// Decides whether `uri` names a committed download under `root`. Without this, a web page could
    /// put the app's database or settings on the share sheet.
    ///
    /// The path is normalised first, so `..` cannot climb out, and then its real path — symbolic
    /// links resolved — must still be under the real path of `root`. Both sides are resolved
    /// because the caches directory itself can sit behind a link (`/var` is `/private/var`).
    static func checkExportable(_ uri: String, root: URL) -> ExportCheck {
        guard let parsed = URL(string: uri), parsed.scheme?.lowercased() == "file" else {
            return .invalid("only file:// URIs are accepted")
        }
        if let host = parsed.host, !host.isEmpty { return .invalid("a file URI must not name a host") }
        let path = parsed.path
        guard path.hasPrefix("/") else { return .invalid("the path is not absolute") }
        // Checked on the raw URI too: Foundation does not always decode `%00` into the path.
        if path.unicodeScalars.contains("\u{0}") || uri.range(of: "%00", options: .caseInsensitive) != nil {
            return .invalid("the path holds a NUL character")
        }

        let lexical = URL(fileURLWithPath: path).standardizedFileURL.path
        let lexicalRoot = root.standardizedFileURL.path
        guard isInside(lexical, lexicalRoot) else { return .invalid("outside the download folder") }
        if lexical.hasSuffix(partSuffix) { return .invalid("the download has not finished") }

        guard FileManager.default.fileExists(atPath: lexical) else { return .missing }
        guard let real = realPath(lexical), let realRoot = realPath(lexicalRoot) else { return .missing }
        guard isInside(real, realRoot) else { return .invalid("resolves outside the download folder") }
        if real.hasSuffix(partSuffix) { return .invalid("the download has not finished") }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: real, isDirectory: &isDirectory), !isDirectory.boolValue else {
            return .invalid("not a file")
        }
        return .accepted(URL(fileURLWithPath: real))
    }

    // MARK: - Sweep (U22)

    /// One transfer folder as the sweep sees it. `modifiedAtMs` is wall-clock time, like a file's mtime.
    struct FolderAge: Equatable {
        let name: String
        let modifiedAtMs: Int64
    }

    /// The folders to delete: last changed more than `sweepAgeMs` before `nowMs`, and not the folder
    /// of a transfer still running — a slow download keeps its folder whatever its age.
    static func foldersToSweep(_ folders: [FolderAge], nowMs: Int64, runningFolderNames: Set<String>) -> [String] {
        folders.filter { !runningFolderNames.contains($0.name) && nowMs - $0.modifiedAtMs > sweepAgeMs }.map(\.name)
    }

    // MARK: - Internals

    private static func isInside(_ path: String, _ root: String) -> Bool {
        var prefix = root
        while prefix.hasSuffix("/") { prefix.removeLast() }
        return path.hasPrefix(prefix + "/")
    }

    /// C0 controls, DEL and C1 controls.
    private static func isControl(_ scalar: Unicode.Scalar) -> Bool {
        scalar.value < 0x20 || (0x7F...0x9F).contains(scalar.value)
    }

    private static func isAsciiAlphanumeric(_ scalar: Unicode.Scalar) -> Bool {
        ("a"..."z").contains(scalar) || ("A"..."Z").contains(scalar) || ("0"..."9").contains(scalar)
    }

    private static func trimEdges(_ text: String) -> String {
        var scalars = Array(text.unicodeScalars)
        while let first = scalars.first, first == " " || first == "." { scalars.removeFirst() }
        while let last = scalars.last, last == " " || last == "." { scalars.removeLast() }
        return String(String.UnicodeScalarView(scalars))
    }

    /// `.part` marks a file still being received, so a hint never keeps it — every trailing one is
    /// dropped, which is what makes the rule give the same answer when applied to its own output.
    private static func withoutPartSuffix(_ text: String) -> String {
        var name = text
        while name.lowercased().hasSuffix(partSuffix) {
            name = trimEdges(String(name.dropLast(partSuffix.count)))
        }
        return name
    }

    private static func realPath(_ path: String) -> String? {
        guard let resolved = realpath(path, nil) else { return nil }
        defer { free(resolved) }
        return String(cString: resolved)
    }
}
