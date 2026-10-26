import Foundation
import React
import UniformTypeIdentifiers

/// ShareIntake — what another app shared to Dou, handed to the web's share page by id.
///
/// The ChaticShareExtension target copies a share into the App Group inbox,
/// `<group>/ShareIntake/<this app's bundle id>/<id>/`, writes its `manifest.json` last, and opens the
/// app on `<scheme>://share?id=<id>`. `fetch` moves each item into a pick folder of its own under
/// `attach-pick` and judges it as a documents pick is judged, so the upload, PrepareVideo and the sweep
/// take it unchanged. The answer is kept in memory, so a page reload gets it again until `release`.
///
/// Errors: `INVALID` for an id that is not a UUID, `GONE` for a share neither in memory nor in the
/// inbox, `INTERNAL` otherwise — never `NOT_FOUND`, which the web reads as "no share intake here".
@objc(ShareIntake)
final class ShareIntake: NSObject {
    private typealias Core = ShareIntakeCore

    /// The web's ceilings (`CHAT_ATTACHMENT_MAX_BYTES`). A share is not handed them with a request as
    /// a pick is, so they are the same numbers kept here.
    private static let max = AttachmentPickerCore.MaxBytes(
        image: 20 * 1024 * 1024,
        video: 300 * 1024 * 1024,
        file: 50 * 1024 * 1024
    )

    private struct Received {
        let payload: [String: Any]
        /// The pick folders the items were moved into, deleted by a discarding release.
        let folders: [URL]
    }

    /// Answers already given, by id. Touched on `queue` only.
    private static var received: [String: Received] = [:]
    private static let queue = DispatchQueue(label: "share-intake")

    struct Rejection: Error {
        let code: String
        let message: String
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc(fetch:resolve:reject:)
    func fetch(_ id: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let id = Core.intakeId(id as String) else { return reject("INVALID", "id must be a share id", nil) }
        Self.queue.async {
            do {
                if let kept = Self.received[id] { return resolve(kept.payload) }
                let kept = try Self.take(id)
                Self.received[id] = kept
                resolve(kept.payload)
            } catch let rejection as Rejection {
                reject(rejection.code, rejection.message, nil)
            } catch {
                reject("INTERNAL", TransferText.sanitize(error.localizedDescription), error)
            }
        }
    }

    @objc(release:discard:resolve:reject:)
    func release(_ id: NSString, discard: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard let id = Core.intakeId(id as String) else { return reject("INVALID", "id must be a share id", nil) }
        Self.queue.async {
            let kept = Self.received.removeValue(forKey: id)
            guard discard else { return resolve(nil) }
            // A share released before it was fetched still waits in the inbox.
            let inboxEntry = Self.inbox?.appendingPathComponent(id, isDirectory: true)
            let left = ((kept?.folders ?? []) + [inboxEntry].compactMap { $0 }).filter { !Self.delete($0) }
            if left.isEmpty { return resolve(nil) }
            // Said, not swallowed: the copies of what someone shared are still on the phone until the
            // day-old sweep, and the caller logs it.
            reject("INTERNAL", "\(left.count) of the share's folders could not be deleted", nil)
        }
    }

    // MARK: - Taking a share out of the inbox

    /// This app's own inbox. A dev and a store build share the App Group; the folder per bundle id
    /// keeps either from taking the other's shares.
    private static var inbox: URL? {
        guard let bundleId = Bundle.main.bundleIdentifier,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Core.appGroup)
        else { return nil }
        return container
            .appendingPathComponent("ShareIntake", isDirectory: true)
            .appendingPathComponent(bundleId, isDirectory: true)
    }

    private static func take(_ id: String) throws -> Received {
        guard let inbox else { throw Rejection(code: "INTERNAL", message: "the share inbox is not available") }
        sweep(inbox)
        AttachmentPicker.sweep()

        let folder = inbox.appendingPathComponent(id, isDirectory: true)
        let manifestURL = folder.appendingPathComponent(Core.manifestFileName)
        let data: Data
        do {
            data = try Data(contentsOf: manifestURL)
        } catch CocoaError.fileReadNoSuchFile, CocoaError.fileNoSuchFile {
            throw Rejection(code: "GONE", message: "no such share")
        }
        guard let manifest = Core.readManifest(data) else {
            // Asking again cannot help, so the share is gone rather than failing.
            try? FileManager.default.removeItem(at: folder)
            throw Rejection(code: "GONE", message: "the share cannot be read")
        }
        // The manifest goes before anything moves, so a share is never taken a second time — its
        // items would be gone and each would come back refused.
        try FileManager.default.removeItem(at: manifestURL)

        var items: [[String: Any]] = []
        var refused: [[String: Any]] = manifest.refused.map { ["name": $0.name, "kind": $0.kind, "reason": $0.reason] }
        var folders: [URL] = []
        for entry in manifest.items {
            switch keep(entry, from: folder) {
            case let .kept(item, pickFolder):
                items.append(item)
                folders.append(pickFolder)
            case let .refused(name, kind, reason):
                refused.append(["name": name, "kind": kind.rawValue, "reason": reason])
            }
        }
        // Everything worth keeping has moved; what is left is refused copies, and the inbox sweep takes
        // the folder a day later if this fails.
        try? FileManager.default.removeItem(at: folder)

        var payload: [String: Any] = ["items": items, "refused": refused]
        if let text = manifest.text { payload["text"] = text }
        return Received(payload: payload, folders: folders)
    }

    private enum Kept {
        case kept([String: Any], URL)
        case refused(String, AttachmentPickerCore.Kind, String)
    }

    /// Moves one item into a pick folder of its own and judges it: a video as a picked video is (it
    /// may need converting), anything else as a documents pick — reported as a file, held to the
    /// limit its format implies.
    private static func keep(_ entry: Core.Manifest.Item, from folder: URL) -> Kept {
        let fm = FileManager.default
        let type = UTType(entry.type)
        let contentType = type?.preferredMIMEType
        let isVideo = type?.conforms(to: .movie) ?? false
        let named = AttachmentPickerCore.diskName(entry.name, fallback: isVideo ? "video" : "file")
        let name = isVideo ? named : AttachmentPickerCore.documentName(named, mimeType: contentType)

        guard let source = Core.itemFile(entry.path, in: folder) else { return .refused(name, .file, "unreadable") }

        guard let size = AttachmentPicker.fileSize(source) else { return .refused(name, isVideo ? .video : .file, "unreadable") }
        let limitKind: AttachmentPickerCore.Kind = isVideo ? .video : AttachmentPickerCore.limitKindForDocument(mimeType: contentType, fileName: name)
        // A video to be converted is held to its limit by PrepareVideo, as a picked one is.
        if !isVideo, AttachmentPickerCore.isTooLarge(kind: limitKind, size: size, needsExport: false, max: max) {
            return .refused(name, limitKind, "too-large")
        }
        guard let pickFolder = try? AttachmentPicker.newFolder() else { return .refused(name, limitKind, "unreadable") }
        let target = pickFolder.appendingPathComponent(name)
        do {
            try fm.moveItem(at: source, to: target)
        } catch {
            try? fm.removeItem(at: pickFolder)
            return .refused(name, limitKind, "unreadable")
        }

        if isVideo {
            switch AttachmentPicker.keepVideo(target, typeIdentifier: entry.type, max: max, estimateConversion: false) {
            case let .kept(item): return .kept(item, pickFolder)
            case .refused(.unreadable): return .refused(name, .video, "unreadable")
            case .refused(.tooLarge): return .refused(name, .video, "too-large")
            }
        }
        return .kept([
            "kind": "file",
            "uri": target.absoluteString,
            "name": name,
            "contentType": contentType ?? "application/octet-stream",
            "size": NSNumber(value: size),
        ], pickFolder)
    }

    /// Deletes `url`; false only when it is still there.
    private static func delete(_ url: URL) -> Bool {
        do {
            try FileManager.default.removeItem(at: url)
            return true
        } catch CocoaError.fileNoSuchFile {
            return true
        } catch {
            return !FileManager.default.fileExists(atPath: url.path)
        }
    }

    /// Deletes inbox entries untouched for a day: shares whose app was never opened on them, when the
    /// share sheet could not open it. Run before a share is taken.
    private static func sweep(_ inbox: URL) {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: inbox.path) else { return }
        let folders: [AttachmentPickerCore.FolderAge] = names.compactMap { name in
            let path = inbox.appendingPathComponent(name).path
            guard let date = (try? fm.attributesOfItem(atPath: path))?[.modificationDate] as? Date else { return nil }
            return AttachmentPickerCore.FolderAge(name: name, newestModifiedAtMs: Int64(date.timeIntervalSince1970 * 1000))
        }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        for name in AttachmentPickerCore.foldersToSweep(folders, nowMs: now) {
            try? fm.removeItem(at: inbox.appendingPathComponent(name))
        }
    }
}
