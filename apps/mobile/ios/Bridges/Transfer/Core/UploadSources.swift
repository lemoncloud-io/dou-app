import Foundation

/// Which local files an upload may read.
///
/// The page asking for an upload is loaded from the network, so the file it names cannot be taken on
/// trust: without a limit it could send the app's database or settings to any signed URL. An upload
/// reads only from the shell's own staging folders — what the attachment picker copied
/// (`attach-pick`, in the caches) and what `WriteTempFile` wrote (`transfer-temp`, in the temporary
/// directory). The Android shell applies the same rule to its own two folders.
enum UploadSources {
    /// The folder `WriteTempFile` writes into, under the temporary directory (`FileManager.m`).
    static let tempFolder = "transfer-temp"

    enum Check: Equatable {
        /// Inside one of the folders and a readable file; the resolved real file.
        case accepted(URL)
        /// Not a file an upload may read: another scheme, outside every folder, a folder itself.
        case invalid(String)
        /// Inside a folder but gone — the OS may have cleared the caches.
        case missing
    }

    /// Decides whether `uri` — a `file://` URI or an absolute path, the two forms an upload has always
    /// taken — names a file strictly inside one of `roots`.
    ///
    /// The path is normalised first, so `..` cannot climb out, and then its real path — symbolic links
    /// resolved — must still be inside the real path of the same root. Both sides are resolved because
    /// the container itself can sit behind a link (`/var` is `/private/var`).
    static func check(_ uri: String, roots: [URL]) -> Check {
        if uri.unicodeScalars.contains("\u{0}") || uri.range(of: "%00", options: .caseInsensitive) != nil {
            return .invalid("the path holds a NUL character")
        }
        if let parsed = URL(string: uri), parsed.isFileURL, let host = parsed.host, !host.isEmpty {
            return .invalid("a file URI must not name a host")
        }
        guard let file = TransferText.localFileURL(uri) else {
            return .invalid("only a file inside the shell's upload folders can be uploaded")
        }
        let lexical = file.standardizedFileURL.path
        guard let root = roots.first(where: { isInside(lexical, $0.standardizedFileURL.path) }) else {
            return .invalid("outside the shell's upload folders")
        }

        guard FileManager.default.fileExists(atPath: lexical) else { return .missing }
        guard let real = realPath(lexical), let realRoot = realPath(root.standardizedFileURL.path) else { return .missing }
        guard isInside(real, realRoot) else { return .invalid("resolves outside the shell's upload folders") }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: real, isDirectory: &isDirectory), !isDirectory.boolValue else {
            return .invalid("not a file")
        }
        return .accepted(URL(fileURLWithPath: real))
    }

    private static func isInside(_ path: String, _ root: String) -> Bool {
        var prefix = root
        while prefix.hasSuffix("/") { prefix.removeLast() }
        return !prefix.isEmpty && path.hasPrefix(prefix + "/")
    }

    private static func realPath(_ path: String) -> String? {
        guard let resolved = realpath(path, nil) else { return nil }
        defer { free(resolved) }
        return String(cString: resolved)
    }
}
