import Foundation
import UniformTypeIdentifiers

/// The share-intake rules that need no UIKit, shared by the ChaticShareExtension target (which writes
/// a share) and the app's `ShareIntake` module (which reads it), and tested on their own in
/// `ChaticTransferCoreTests`: the id, the manifest and the paths it may name, what a shared item is
/// taken as, the name it is kept under, and what counts as its text.
enum ShareIntakeCore {
    // MARK: - The inbox

    /// Shared by the app and the extension. The inbox in it is one folder per app bundle id, so a dev
    /// and a store build on one phone never take each other's shares.
    static let appGroup = "group.io.chatic.dou"

    static let manifestFileName = "manifest.json"

    /// One message's worth; the share sheet offers Dou for at most this many items.
    static let itemMax = 10

    /// One share as the extension writes it, last, once every copy is in place.
    struct Manifest: Codable, Equatable {
        struct Item: Codable, Equatable {
            /// `<slot>/<name>` under the share's folder.
            let path: String
            let name: String
            /// The type identifier the file was handed over as.
            let type: String
        }

        struct Refusal: Codable, Equatable {
            let name: String
            let kind: String
            let reason: String
        }

        static let currentVersion = 1

        var version = currentVersion
        var items: [Item] = []
        var refused: [Refusal] = []
        var text: String?
    }

    /// A manifest this app can read, or nil — malformed, or written by an extension of a version it
    /// does not know. Either way the share can never be read, however often it is asked for.
    static func readManifest(_ data: Data) -> Manifest? {
        guard let manifest = try? JSONDecoder().decode(Manifest.self, from: data),
              manifest.version == Manifest.currentVersion
        else { return nil }
        return manifest
    }

    /// The id the extension made, a UUID, lower-cased as it writes it. Anything else never reaches a path.
    static func intakeId(_ raw: String) -> String? {
        UUID(uuidString: raw) == nil ? nil : raw.lowercased()
    }

    /// The file a manifest `path` names, or nil unless it is exactly `<slot>/<name>` inside `folder`. The
    /// extension writes nothing else, and a path that leaves the share's folder is not read.
    static func itemFile(_ path: String, in folder: URL) -> URL? {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
        let file = folder.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(folder.standardizedFileURL.path + "/") else { return nil }
        return file
    }

    // MARK: - What a shared item is

    enum ItemKind: String {
        case image, video, file
    }

    enum Content: Equatable {
        /// Shared as text, read as this type: a web link, or plain text that is not a file.
        case text(String)
        /// A photo, a video or a document, with the types to ask the provider for, in order.
        case file(ItemKind, [String])
    }

    /// The four photo formats the server takes.
    private static let photoTypes: [UTType] = [.jpeg, .png, .gif, .webP]

    /// What an item offering `typeIdentifiers` is taken as. A photo in a format the server takes goes
    /// as stored; any other photo (HEIC) is asked for as JPEG first, which its provider converts, then
    /// as it is. A file — anything that also offers a file URL — is never read as text.
    static func content(of typeIdentifiers: [String]) -> Content? {
        let types = typeIdentifiers.compactMap(UTType.init)
        let isFile = types.contains(.fileURL)
        if !isFile, types.contains(where: { $0.conforms(to: .url) }) { return .text(UTType.url.identifier) }
        if !isFile, !types.isEmpty, types.allSatisfy({ $0.conforms(to: .text) }) { return .text(UTType.plainText.identifier) }

        // A Live Photo's bundle is not an image file; its still is taken instead.
        let usable = types.filter { !$0.conforms(to: .livePhoto) && $0.identifier != "com.apple.live-photo-bundle" && $0 != .fileURL }
        if let image = usable.first(where: { $0.conforms(to: .image) }) {
            let stored = usable.filter { type in photoTypes.contains { type.conforms(to: $0) } }.map(\.identifier)
            return .file(.image, unique(stored + [UTType.jpeg.identifier, image.identifier]))
        }
        if let movie = usable.first(where: { $0.conforms(to: .movie) }) {
            return .file(.video, [movie.identifier])
        }
        if let data = usable.first(where: { $0.conforms(to: .data) }) {
            return .file(.file, [data.identifier])
        }
        return nil
    }

    /// The name an item is kept under: the other app's name for it with the extension of what was
    /// actually handed over (a HEIC asked for as JPEG ends in `.jpg`), never a path.
    static func fileName(suggested: String?, loadedName: String, type: String) -> String {
        let loaded = loadedName as NSString
        let raw = suggested.flatMap { $0.isEmpty ? nil : $0 } ?? loaded.deletingPathExtension
        let base = raw.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: ":", with: "_")
        var stem = (base as NSString).deletingPathExtension.trimmingCharacters(in: .whitespacesAndNewlines)
        if stem.isEmpty || stem == "." || stem == ".." { stem = "file" }
        let ext = loaded.pathExtension.isEmpty ? (UTType(type)?.preferredFilenameExtension ?? "") : loaded.pathExtension
        return ext.isEmpty ? stem : "\(stem).\(ext)"
    }

    /// The text an item handed over as text: a web link or a string. A file URL is not text — sent as
    /// one it would be a path on this device.
    static func sharedText(_ item: Any?) -> String? {
        let text: String?
        switch item {
        case let url as URL: text = url.isFileURL ? nil : url.absoluteString
        case let string as String: text = string
        case let data as Data: text = String(data: data, encoding: .utf8)
        default: text = nil
        }
        let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed?.isEmpty == false ? trimmed : nil
    }

    /// The text an app puts on the shared item itself rather than in an attachment — some send a post
    /// or a note that way, with no attachment at all.
    static func itemText(_ text: NSAttributedString?) -> String? {
        sharedText(text?.string)
    }

    private static func unique(_ identifiers: [String]) -> [String] {
        var seen = Set<String>()
        return identifiers.filter { seen.insert($0).inserted }
    }
}
