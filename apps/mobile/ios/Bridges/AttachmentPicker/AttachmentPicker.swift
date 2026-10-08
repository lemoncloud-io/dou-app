import AVFoundation
import Foundation
import ImageIO
import PhotosUI
import React
import UIKit
import UniformTypeIdentifiers

/// AttachmentPicker — picks photos, videos and documents for a chat message and keeps them in the
/// shell, makes a picked video ready to upload, reads a picked photo's bytes, and reads one frame of
/// a sent video for the web to show as its poster.
///
/// Everything picked is copied into `Caches/attach-pick/<uuid>/` and handed to the web as a `file://`
/// URI. A video's or document's bytes never cross the bridge: the transfer uploads it from there. A
/// photo is kept prepared exactly as the in-app photo grid prepares one (`PhotoLibraryCore.prepare`),
/// and its bytes cross later, one photo per `readAttachment`, because the web prepares every photo
/// itself — ten photos in the pick's own answer would be one message of some 200 MB of base64. A
/// video sent from the in-app grid (`PhotoLibrary.keepLibraryVideo`) is kept in the same folders and
/// judged by the same `keepVideo` as a picked one, so PrepareVideo and the transfer take it alike.
///
/// The rules that need no UIKit or AVFoundation live in `Core/AttachmentPickerCore.swift`.
@objc(AttachmentPicker)
final class AttachmentPicker: NSObject {
    /// Where picked copies live. The transfer reads uploads from here (`TransferSessionOwner.uploadRoots`).
    static var root: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(AttachmentPickerCore.folder, isDirectory: true)
    }

    /// The picker on screen, held until its answer is sent. Touched on the main thread only.
    private static var active: PickSession?

    struct Rejection: Error {
        let code: String
        let message: String
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Pick

    @objc(pick:selectionLimit:maxBytes:resolve:reject:)
    func pick(
        _ source: NSString,
        selectionLimit: NSNumber,
        maxBytes: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        func limit(_ key: String) -> Int64 { (maxBytes[key] as? NSNumber)?.int64Value ?? 0 }
        let max = AttachmentPickerCore.MaxBytes(image: limit("image"), video: limit("video"), file: limit("file"))
        let count = AttachmentPickerCore.selectionLimit(selectionLimit.intValue)
        let source = source as String

        DispatchQueue.main.async {
            guard Self.active == nil else { return reject("BUSY", "a picker is already open", nil) }
            guard source == "media" || source == "document" else {
                return reject("INVALID", "source must be media or document", nil)
            }
            // A controller mid-transition refuses a presentation without calling back, which would
            // leave the web's request waiting until it times out.
            guard let presenter = Self.topViewController(), !presenter.isBeingDismissed, !presenter.isBeingPresented else {
                return reject("INTERNAL", "there is no screen free to show the picker on", nil)
            }

            let session = PickSession(max: max) { payload in
                DispatchQueue.main.async {
                    Self.active = nil
                    resolve(payload)
                }
            }
            Self.active = session
            // Swept before anything new is copied, on the queue the copies are made on.
            PickSession.copyQueue.async { Self.sweep() }

            let controller: UIViewController
            if source == "media" {
                var configuration = PHPickerConfiguration()
                configuration.filter = .any(of: [.images, .videos])
                configuration.selectionLimit = count
                // The asset as stored: the automatic mode would transcode a HEVC video to H.264 before
                // handing it over, which PrepareVideo does anyway, at a size it controls.
                configuration.preferredAssetRepresentationMode = .current
                let picker = PHPickerViewController(configuration: configuration)
                picker.delegate = session
                controller = picker
            } else {
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: Self.documentTypes, asCopy: true)
                picker.allowsMultipleSelection = true
                picker.delegate = session
                controller = picker
            }
            controller.presentationController?.delegate = session
            presenter.present(controller, animated: true) {
                guard controller.presentingViewController == nil else { return }
                session.cancel()
            }
        }
    }

    /// Every format the server takes — its four photo formats, MP4 and its seven document formats — so
    /// a photo or a video kept in Files can be sent from here too. Nothing beyond them: a file the
    /// server would refuse is not offered. The pick still reports every item as a file; the web tells a
    /// photo or a video by its format. HWP and HWPX have no system type, so they are named by their
    /// extension; that type matches any file with it, and is the installed Hancom app's own type when
    /// there is one.
    private static var documentTypes: [UTType] {
        [.png, .jpeg, .gif, .webP, .mpeg4Movie, .pdf, .plainText]
            + ["docx", "xlsx", "pptx", "hwp", "hwpx"].compactMap { UTType(filenameExtension: $0, conformingTo: .data) }
    }

    /// Deletes pick folders untouched for a day. A folder's age is its newest change, so one whose
    /// video was converted an hour ago is kept even when it was picked yesterday. Run before a pick,
    /// and before a video is kept from the in-app grid, so someone who only ever sends from the grid
    /// does not collect copies until the OS purges the cache.
    static func sweep() {
        let fm = FileManager.default
        let root = Self.root
        guard let names = try? fm.contentsOfDirectory(atPath: root.path) else { return }
        func modified(_ path: String) -> Int64? {
            ((try? fm.attributesOfItem(atPath: path))?[.modificationDate] as? Date).map { Int64($0.timeIntervalSince1970 * 1000) }
        }
        let folders: [AttachmentPickerCore.FolderAge] = names.compactMap { name in
            let path = root.appendingPathComponent(name).path
            guard let own = modified(path) else { return nil }
            let inside = ((try? fm.contentsOfDirectory(atPath: path)) ?? []).compactMap { modified("\(path)/\($0)") }
            return AttachmentPickerCore.FolderAge(name: name, newestModifiedAtMs: ([own] + inside).max() ?? own)
        }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        for name in AttachmentPickerCore.foldersToSweep(folders, nowMs: now) {
            try? fm.removeItem(at: root.appendingPathComponent(name))
        }
    }

    // MARK: - Prepare video

    @objc(prepareVideo:resolve:reject:)
    func prepareVideo(_ uri: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let uri = uri as String
        Task.detached(priority: .userInitiated) {
            do {
                resolve(try await VideoPreparation.prepare(uri))
            } catch let rejection as Rejection {
                reject(rejection.code, rejection.message, nil)
            } catch {
                reject("SYSTEM", TransferText.sanitize(error.localizedDescription), nil)
            }
        }
    }

    // MARK: - Read attachment

    /// A picked photo's bytes, in the shape `PhotoLibrary.readPhoto` answers. Needs no permission: the
    /// file is the shell's own copy.
    @objc(readAttachment:resolve:reject:)
    func readAttachment(_ uri: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let uri = uri as String
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                resolve(try Self.readPhoto(uri))
            } catch let rejection as Rejection {
                reject(rejection.code, rejection.message, nil)
            } catch {
                reject("INTERNAL", TransferText.sanitize(error.localizedDescription), nil)
            }
        }
    }

    private static func readPhoto(_ uri: String) throws -> [String: Any] {
        let file = try pickedFile(uri)
        guard let mimeType = AttachmentPickerCore.photoMimeType(fileExtension: file.pathExtension) else {
            throw Rejection(code: "INTERNAL", message: "not a picked photo")
        }
        let data: Data
        do {
            data = try Data(contentsOf: file)
        } catch {
            // Gone between the check and the read.
            guard FileManager.default.fileExists(atPath: file.path) else {
                throw Rejection(code: "SOURCE", message: "the picked photo no longer exists")
            }
            throw Rejection(code: "INTERNAL", message: TransferText.sanitize(error.localizedDescription))
        }
        guard let size = pixelSize(data) else { throw Rejection(code: "INTERNAL", message: "the photo cannot be decoded") }
        return [
            "base64": data.base64EncodedString(),
            "mimeType": mimeType,
            "fileName": file.lastPathComponent,
            "width": size.width,
            "height": size.height,
        ]
    }

    // MARK: - Read video frame

    /// One frame of a sent video, read straight from its signed storage URL, as a JPEG in base64: a
    /// poster for a video whose message carries none. Nothing is written to disk — the frame is
    /// decoded from what AVFoundation streams and answered in memory. `INVALID` for arguments
    /// `AttachmentPickerCore.frameRequest` refuses, `UNREADABLE` for every other failure, the
    /// shell's own 20 s timeout included.
    ///
    /// The numbers arrive optional so a missing one is refused as `INVALID` rather than trapping on
    /// a nil the bridge passed through.
    @objc(readVideoFrame:atMs:maxEdge:resolve:reject:)
    func readVideoFrame(
        _ url: NSString,
        atMs: NSNumber?,
        maxEdge: NSNumber?,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let request = AttachmentPickerCore.frameRequest(
            url: url as String, atMs: atMs?.doubleValue ?? .nan, maxEdge: maxEdge?.doubleValue ?? .nan
        ) else {
            return reject("INVALID", "url must be https, atMs zero or more and maxEdge above zero", nil)
        }
        VideoFrame.queue.addOperation {
            do {
                resolve(try VideoFrame.read(request))
            } catch let rejection as Rejection {
                reject(rejection.code, rejection.message, nil)
            } catch {
                reject("UNREADABLE", TransferText.sanitize(error.localizedDescription), nil)
            }
        }
    }

    // MARK: - Keep a video

    /// Why a kept video copy was refused.
    enum VideoRefusal {
        /// Its size, or its tracks, could not be read.
        case unreadable
        /// Over the video ceiling as it is, or — when the conversion is estimated — even at 720p.
        case tooLarge
    }

    enum KeptVideo {
        /// The answer's item: `{ kind: "video", uri, name, contentType, size, needsExport? }`.
        case kept([String: Any])
        case refused(VideoRefusal)
    }

    /// The judgement every video copied into a pick folder goes through, from the system picker or
    /// from the in-app grid: its size and tracks are read, whether it needs converting is decided, it
    /// is held to the ceiling, and the item the web is answered with is built. A refused copy's folder
    /// is deleted here, so neither caller leaves one behind.
    ///
    /// `estimateConversion` decides what happens to a video that will be converted. A pick leaves it
    /// to PrepareVideo (the picker answers once every item is copied, and an estimate per item would
    /// hold the whole answer up); the grid sends one video per call and asks for the estimate now, so
    /// a video PrepareVideo would refuse is refused before the message is written. Both use the same
    /// preset steps (`VideoPreparation.exportChoice`), so the two answers cannot disagree.
    ///
    /// Blocking: it waits on AVFoundation. Called on a queue of its caller's own.
    static func keepVideo(
        _ file: URL,
        typeIdentifier: String?,
        max: AttachmentPickerCore.MaxBytes,
        estimateConversion: Bool
    ) -> KeptVideo {
        let folder = file.deletingLastPathComponent()
        guard let size = fileSize(file), let facts = VideoPreparation.facts(of: file) else {
            try? FileManager.default.removeItem(at: folder)
            return .refused(.unreadable)
        }
        let needsExport = AttachmentPickerCore.needsExport(facts)
        let tooLarge = needsExport
            ? estimateConversion && VideoPreparation.conversionIsTooLarge(file)
            : AttachmentPickerCore.isTooLarge(kind: .video, size: size, needsExport: false, max: max)
        if tooLarge {
            try? FileManager.default.removeItem(at: folder)
            return .refused(.tooLarge)
        }
        var item: [String: Any] = [
            "kind": "video",
            "uri": file.absoluteString,
            "name": file.lastPathComponent,
            "contentType": typeIdentifier.flatMap { UTType($0)?.preferredMIMEType }
                ?? UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
                ?? "application/octet-stream",
            "size": NSNumber(value: size),
        ]
        if needsExport { item["needsExport"] = true }
        return .kept(item)
    }

    // MARK: - Internals

    static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.flatMap(\.windows)
        var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }

    /// A new `attach-pick/<uuid>/` folder.
    static func newFolder() throws -> URL {
        let folder = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    static func fileSize(_ url: URL) -> Int64? {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.int64Value
    }

    /// The picked file `uri` names: inside `attach-pick`, in a pick folder of its own, and still there.
    /// `INVALID` for anything else, `SOURCE` when it is gone.
    static func pickedFile(_ uri: String) throws -> URL {
        guard !uri.isEmpty else { throw Rejection(code: "INVALID", message: "uri is required") }
        switch UploadSources.check(uri, roots: [root]) {
        case let .accepted(file):
            guard AttachmentPickerCore.isInPickFolder(file.path) else {
                throw Rejection(code: "INVALID", message: "not a picked file")
            }
            return file
        case let .invalid(reason):
            throw Rejection(code: "INVALID", message: reason)
        case .missing:
            throw Rejection(code: "SOURCE", message: "the picked file no longer exists")
        }
    }

    /// An image's size as displayed — EXIF orientations 5 to 8 swap it — as the grid reports a library
    /// photo's. `nil` when it cannot be read.
    static func pixelSize(_ data: Data) -> (width: Int, height: Int)? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }
        return AttachmentPickerCore.orientedPixelSize(
            width: width, height: height, exifOrientation: properties[kCGImagePropertyOrientation] as? Int
        )
    }
}

// MARK: - Pick session

/// One open picker: its delegate, and the copying that follows it. It answers exactly once — with
/// what was picked, or with nothing when the picker was dismissed.
private final class PickSession: NSObject, PHPickerViewControllerDelegate, UIDocumentPickerDelegate,
    UIAdaptivePresentationControllerDelegate
{
    /// Copies run one at a time, so a pick holds at most one photo's bytes in memory, and the reply
    /// keeps pick order.
    static let copyQueue = DispatchQueue(label: "io.chatic.dou.attachment-picker.copy", qos: .userInitiated)

    private let max: AttachmentPickerCore.MaxBytes
    private let answer: ([String: Any]) -> Void
    /// Main thread only.
    private var closed = false

    init(max: AttachmentPickerCore.MaxBytes, answer: @escaping ([String: Any]) -> Void) {
        self.max = max
        self.answer = answer
    }

    /// The picker could not be shown, or went away without telling its delegate.
    func cancel() {
        guard !closed else { return }
        closed = true
        answer(["items": [], "refused": []])
    }

    // MARK: Media

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard !closed else { return }
        closed = true
        let providers = results.map(\.itemProvider)
        let max = self.max
        let answer = self.answer
        Self.copyQueue.async {
            var collected = Collected()
            for provider in providers {
                Self.take(provider, max: max, into: &collected)
            }
            answer(collected.payload)
        }
    }

    /// Reads one picked item. Runs on `copyQueue` and waits there for the provider's callback: the
    /// file a provider hands over is deleted as soon as its callback returns, so the copy has to be
    /// made inside it.
    private static func take(_ provider: NSItemProvider, max: AttachmentPickerCore.MaxBytes, into collected: inout Collected) {
        // A photo first, so an item that offers both (a Live Photo) goes as its still.
        if let type = firstType(of: provider, conformingTo: .image) {
            takeImage(provider, type: type, max: max, into: &collected)
        } else if let type = firstType(of: provider, conformingTo: .movie) {
            takeVideo(provider, type: type, max: max, into: &collected)
        } else {
            collected.refuse(provider.suggestedName ?? "", kind: refusedKind(provider), .unsupported)
        }
    }

    /// What an item neither taken as a photo nor as a video was: a photo when it offers any image (a
    /// Live Photo's bundle alone), a video when it offers any audiovisual content, else a file.
    private static func refusedKind(_ provider: NSItemProvider) -> AttachmentPickerCore.Kind {
        let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
        if types.contains(where: { $0.conforms(to: .image) || $0.conforms(to: .livePhoto) }) { return .image }
        if types.contains(where: { $0.conforms(to: .audiovisualContent) }) { return .video }
        return .file
    }

    /// The provider's own type for this kind — the representation as stored, not a converted one. A
    /// Live Photo's bundle is not an image file, so its still is taken instead.
    private static func firstType(of provider: NSItemProvider, conformingTo kind: UTType) -> String? {
        provider.registeredTypeIdentifiers.first { identifier in
            guard let type = UTType(identifier), !type.conforms(to: .livePhoto), identifier != "com.apple.live-photo-bundle" else {
                return false
            }
            return type.conforms(to: kind)
        }
    }

    private static func takeVideo(_ provider: NSItemProvider, type: String, max: AttachmentPickerCore.MaxBytes, into collected: inout Collected) {
        let done = DispatchSemaphore(value: 0)
        var copied: URL?
        provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
            defer { done.signal() }
            guard let url else { return }
            let name = AttachmentPickerCore.diskName(
                AttachmentPickerCore.pickedName(suggested: provider.suggestedName, fileExtension: url.pathExtension),
                fallback: AttachmentPickerCore.diskName(url.lastPathComponent, fallback: "video")
            )
            guard let folder = try? AttachmentPicker.newFolder() else { return }
            let target = folder.appendingPathComponent(name)
            do {
                try FileManager.default.copyItem(at: url, to: target)
                copied = target
            } catch {
                try? FileManager.default.removeItem(at: folder)
            }
        }
        done.wait()

        guard let file = copied else {
            return collected.refuse(provider.suggestedName ?? "", kind: .video, .unreadable)
        }
        // A converted video's size is left to PrepareVideo here; see `keepVideo`.
        switch AttachmentPicker.keepVideo(file, typeIdentifier: type, max: max, estimateConversion: false) {
        case let .kept(item):
            collected.items.append(item)
        case .refused(.unreadable):
            collected.refuse(file.lastPathComponent, kind: .video, .unreadable)
        case .refused(.tooLarge):
            collected.refuse(file.lastPathComponent, kind: .video, .tooLarge)
        }
    }

    private static func takeImage(_ provider: NSItemProvider, type: String, max: AttachmentPickerCore.MaxBytes, into collected: inout Collected) {
        let done = DispatchSemaphore(value: 0)
        var data: Data?
        provider.loadDataRepresentation(forTypeIdentifier: type) { result, _ in
            data = result
            done.signal()
        }
        done.wait()

        let suggested = provider.suggestedName ?? ""
        // The same preparation `ReadPhoto` applies: location removed, HEIC and the like as JPEG.
        guard let data, let prepared = PhotoLibraryCore.prepare(data, typeIdentifier: type) else {
            return collected.refuse(suggested, kind: .image, .unreadable)
        }
        let fileName = AttachmentPickerCore.diskName(
            PhotoLibraryCore.fileName(original: suggested, fileExtension: prepared.fileExtension),
            fallback: "photo.\(prepared.fileExtension)"
        )
        if AttachmentPickerCore.isTooLarge(kind: .image, size: Int64(prepared.data.count), needsExport: false, max: max) {
            return collected.refuse(fileName, kind: .image, .tooLarge)
        }
        // Kept, prepared, in a pick folder of its own; `readAttachment` hands its bytes over later.
        guard let folder = try? AttachmentPicker.newFolder() else { return collected.refuse(fileName, kind: .image, .unreadable) }
        let target = folder.appendingPathComponent(fileName)
        do {
            try prepared.data.write(to: target, options: .atomic)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            return collected.refuse(fileName, kind: .image, .unreadable)
        }
        let size = AttachmentPicker.pixelSize(prepared.data) ?? (0, 0)
        collected.items.append([
            "kind": "image",
            "uri": target.absoluteString,
            "name": fileName,
            "contentType": prepared.mimeType,
            "size": NSNumber(value: prepared.data.count),
            "width": size.width,
            "height": size.height,
        ])
    }

    // MARK: Documents

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard !closed else { return }
        closed = true
        let max = self.max
        let answer = self.answer
        Self.copyQueue.async {
            var collected = Collected()
            for url in urls {
                Self.takeDocument(url, max: max, into: &collected)
            }
            answer(collected.payload)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        cancel()
    }

    /// Moves the picker's copy (in the app's own inbox) into a pick folder.
    private static func takeDocument(_ url: URL, max: AttachmentPickerCore.MaxBytes, into collected: inout Collected) {
        let fm = FileManager.default
        // Read before the move: the type is the system's for this file, HWP's usually none.
        let contentType = (try? url.resourceValues(forKeys: [.contentTypeKey]))?.contentType?.preferredMIMEType
        // A photo whose name lacks its extension gets one, so `readAttachment` can read it back.
        let name = AttachmentPickerCore.documentName(
            AttachmentPickerCore.diskName(url.lastPathComponent, fallback: "file"),
            mimeType: contentType
        )
        // Held to, and refused under, the limit its format implies: the web sends a photo or an MP4
        // from here as a photo or a video. It is still reported as a file below.
        let limitKind = AttachmentPickerCore.limitKindForDocument(mimeType: contentType, fileName: name)
        guard let size = AttachmentPicker.fileSize(url) else { return collected.refuse(name, kind: .file, .unreadable) }
        if AttachmentPickerCore.isTooLarge(kind: limitKind, size: size, needsExport: false, max: max) {
            try? fm.removeItem(at: url)
            return collected.refuse(name, kind: limitKind, .tooLarge)
        }
        guard let folder = try? AttachmentPicker.newFolder() else { return collected.refuse(name, kind: .file, .unreadable) }
        let target = folder.appendingPathComponent(name)
        do {
            do {
                try fm.moveItem(at: url, to: target)
            } catch {
                try fm.copyItem(at: url, to: target)
            }
        } catch {
            try? fm.removeItem(at: folder)
            return collected.refuse(name, kind: .file, .unreadable)
        }
        collected.items.append([
            "kind": "file",
            "uri": target.absoluteString,
            "name": name,
            "contentType": contentType ?? "application/octet-stream",
            "size": NSNumber(value: size),
        ])
    }

    // MARK: Dismissal

    /// A swipe-down dismissal that the picker itself did not report.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        cancel()
    }
}

/// What a pick collected, in pick order.
private struct Collected {
    enum Reason: String {
        case tooLarge = "too-large"
        case unsupported
        case unreadable
    }

    var items: [[String: Any]] = []
    var refused: [[String: Any]] = []

    /// `kind` is what the item was, so the web names the right limit.
    mutating func refuse(_ name: String, kind: AttachmentPickerCore.Kind, _ reason: Reason) {
        refused.append(["name": name, "kind": kind.rawValue, "reason": reason.rawValue])
    }

    var payload: [String: Any] { ["items": items, "refused": refused] }
}

// MARK: - Video preparation

/// PrepareVideo: an H.264/AAC `mp4` with its index first, and a poster frame, both written beside the
/// picked copy.
enum VideoPreparation {
    private typealias Rejection = AttachmentPicker.Rejection

    /// A preparation's answer, carried between tasks. Built once and only read afterwards.
    private struct Answer: @unchecked Sendable {
        let payload: [String: Any]
    }

    /// The preparations running now, by source file. A second call for a video still being prepared
    /// waits for that one and gets its answer, instead of starting a second export into the same names.
    private static let inFlight = AttachmentPickerCore.InFlight<Answer>()

    static func prepare(_ uri: String) async throws -> [String: Any] {
        let source = try AttachmentPicker.pickedFile(uri)
        return try await inFlight.run(source.path) { Answer(payload: try await prepare(source: source)) }.payload
    }

    private static func prepare(source: URL) async throws -> [String: Any] {
        let folder = source.deletingLastPathComponent()
        let asset = AVURLAsset(url: source)
        guard let sourceFacts = await facts(of: asset, fileExtension: source.pathExtension) else {
            throw Rejection(code: "SYSTEM", message: "the file has no readable video track")
        }

        let result: URL
        if AttachmentPickerCore.needsExport(sourceFacts) {
            result = try await convert(asset, to: folder.appendingPathComponent(AttachmentPickerCore.outputName(source.lastPathComponent)))
        } else {
            // Already what the conversion would write; only the poster is made.
            result = source
        }

        let output = AVURLAsset(url: result)
        guard let size = AttachmentPicker.fileSize(result), let outputFacts = await facts(of: output, fileExtension: "mp4") else {
            throw Rejection(code: "SYSTEM", message: "the converted video cannot be read")
        }
        var payload: [String: Any] = [
            "file": [
                "uri": result.absoluteString,
                "name": result.lastPathComponent,
                "contentType": "video/mp4",
                "size": NSNumber(value: size),
                "width": outputFacts.width,
                "height": outputFacts.height,
            ] as [String: Any],
        ]
        if let poster = await poster(of: output, in: folder) {
            payload["poster"] = poster
        } else {
            payload["poster"] = NSNull()
        }
        return payload
    }

    // MARK: Facts

    /// Blocking form, for the pick queue.
    static func facts(of file: URL) -> AttachmentPickerCore.VideoFacts? {
        let done = DispatchSemaphore(value: 0)
        var result: AttachmentPickerCore.VideoFacts?
        Task.detached {
            result = await facts(of: AVURLAsset(url: file), fileExtension: file.pathExtension)
            done.signal()
        }
        done.wait()
        return result
    }

    /// The tracks' codecs and the display size, or `nil` without a readable video track.
    static func facts(of asset: AVURLAsset, fileExtension: String) async -> AttachmentPickerCore.VideoFacts? {
        guard let video = try? await asset.loadTracks(withMediaType: .video).first,
              let loaded = try? await video.load(.formatDescriptions, .naturalSize, .preferredTransform)
        else { return nil }
        let (descriptions, natural, transform) = loaded
        let audio = try? await asset.loadTracks(withMediaType: .audio).first
        var audioCodec: String?
        if let audio {
            audioCodec = (try? await audio.load(.formatDescriptions))?.first.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) } ?? "????"
        }
        let size = AttachmentPickerCore.displaySize(natural: natural, transform: transform)
        return AttachmentPickerCore.VideoFacts(
            fileExtension: fileExtension,
            videoCodec: descriptions.first.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) },
            audioCodec: audioCodec,
            width: size.width,
            height: size.height
        )
    }

    private static func fourCC(_ code: FourCharCode) -> String {
        let bytes = [24, 16, 8, 0].map { UInt8((code >> $0) & 0xFF) }
        return String(bytes: bytes, encoding: .macOSRoman) ?? "????"
    }

    // MARK: Conversion

    /// What the size estimate allows for one source.
    enum ExportChoice {
        /// Convert with this session, its preset already chosen.
        case session(AVAssetExportSession)
        /// Over the limit even at 720p.
        case tooLarge
        /// No session could be made for this source.
        case unavailable
    }

    /// The export session to convert with: 1080p, or 720p when 1080p's estimate is over the limit,
    /// stepped by `AttachmentPickerCore.sizeStep`. The one place the size of a conversion is judged —
    /// PrepareVideo converts with what it returns, and a video kept from the grid is refused at once
    /// when it says `tooLarge`.
    static func exportChoice(for asset: AVURLAsset) async -> ExportChoice {
        var preset = AttachmentPickerCore.ExportPreset.p1080
        while true {
            guard let candidate = AVAssetExportSession(asset: asset, presetName: presetName(preset)) else {
                return .unavailable
            }
            // The async estimate; the old synchronous `estimatedOutputFileLength` answers 0 here.
            let estimate = try? await candidate.estimatedOutputFileLengthInBytes
            switch AttachmentPickerCore.sizeStep(preset: preset, estimatedBytes: estimate) {
            case .export:
                return .session(candidate)
            case let .stepDown(next):
                preset = next
            case .tooLarge:
                return .tooLarge
            }
        }
    }

    /// Blocking form, for a queue that judges a kept video: whether `exportChoice` refuses the file.
    /// A source no session can be made for is not refused here — PrepareVideo fails it with the
    /// reason, as it would have without this check.
    static func conversionIsTooLarge(_ file: URL) -> Bool {
        let done = DispatchSemaphore(value: 0)
        let result = WaitBox(false)
        Task.detached {
            if case .tooLarge = await exportChoice(for: AVURLAsset(url: file)) { result.value = true }
            done.signal()
        }
        done.wait()
        return result.value
    }

    /// Converts with `exportChoice`'s session into `target`. The export writes a hidden file of its
    /// own first and replaces `target` only once it is complete, so a name that already holds the
    /// source (`clip.mp4` in HEVC) is never left half written.
    private static func convert(_ asset: AVURLAsset, to target: URL) async throws -> URL {
        let session: AVAssetExportSession
        switch await exportChoice(for: asset) {
        case let .session(chosen):
            session = chosen
        case .tooLarge:
            throw Rejection(code: "TOO_LARGE", message: "the video is over the size limit even at 720p")
        case .unavailable:
            throw Rejection(code: "SYSTEM", message: "the video cannot be converted")
        }

        let fm = FileManager.default
        let staging = target.deletingLastPathComponent().appendingPathComponent(AttachmentPickerCore.exportStagingName())
        session.outputURL = staging
        session.outputFileType = .mp4
        // The index (`moov`) goes first, so the web can start playing before the download ends.
        session.shouldOptimizeForNetworkUse = true

        // An export has no background time: iOS stops it once the app leaves the screen. It is ended
        // there and then, as a failure the web retries from the start, rather than left to stall.
        let running = ExportHandle(session)
        let observer = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil
        ) { _ in running.session.cancelExport() }
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { done.resume() }
        }
        NotificationCenter.default.removeObserver(observer)

        guard session.status == .completed else {
            try? fm.removeItem(at: staging)
            let reason = session.status == .cancelled ? "the conversion stopped when the app left the screen" : session.error?.localizedDescription ?? "the conversion failed"
            throw Rejection(code: "SYSTEM", message: TransferText.sanitize(reason))
        }
        do {
            if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
            try fm.moveItem(at: staging, to: target)
        } catch {
            try? fm.removeItem(at: staging)
            throw Rejection(code: "SYSTEM", message: TransferText.sanitize(error.localizedDescription))
        }
        return target
    }

    private static func presetName(_ preset: AttachmentPickerCore.ExportPreset) -> String {
        switch preset {
        case .p1080: return AVAssetExportPreset1920x1080
        case .p720: return AVAssetExportPreset1280x720
        }
    }

    // MARK: Poster

    /// A JPEG of the frame at 0.5 s (the first, for a shorter video), 400 px on its long side, at the
    /// highest quality from 0.7 down that fits 200 KB. `nil` on any failure: the video goes without one.
    private static func poster(of asset: AVURLAsset, in folder: URL) async -> [String: Any]? {
        let duration = (try? await asset.load(.duration))?.seconds ?? 0
        let time = CMTime(seconds: AttachmentPickerCore.posterTimeSeconds(durationSeconds: duration), preferredTimescale: 600)
        let generator = frameGenerator(for: asset, longSide: CGFloat(AttachmentPickerCore.posterLongSide))

        let frame: CGImage?
        if #available(iOS 16.0, *) {
            frame = try? await generator.image(at: time).image
        } else {
            frame = try? generator.copyCGImage(at: time, actualTime: nil)
        }
        guard let frame else { return nil }
        let image = UIImage(cgImage: frame)
        guard let data = AttachmentPickerCore.firstFitting(encode: { image.jpegData(compressionQuality: CGFloat($0)) }) else { return nil }
        let file = folder.appendingPathComponent(AttachmentPickerCore.posterName)
        guard (try? data.write(to: file, options: .atomic)) != nil else { return nil }
        return [
            "uri": file.absoluteString,
            "base64": data.base64EncodedString(),
            "contentType": "image/jpeg",
            "size": NSNumber(value: data.count),
            "width": frame.width,
            "height": frame.height,
        ]
    }

    /// A generator for one still: upright as the video is shown, at most `longSide` on its long side
    /// (never scaled up — `maximumSize` only shrinks), and taken at exactly the time asked rather than
    /// at the nearest keyframe, which can be seconds away. Shared by the poster and `ReadVideoFrame`,
    /// so a frame read later from storage looks like the poster the shell would have made.
    static func frameGenerator(for asset: AVAsset, longSide: CGFloat) -> AVAssetImageGenerator {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: longSide, height: longSide)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        return generator
    }
}

// MARK: - Remote video frame

/// ReadVideoFrame: one frame of a video already in storage, read over the network and answered in
/// memory. Used for a sent video whose message has no poster.
enum VideoFrame {
    private typealias Rejection = AttachmentPicker.Rejection

    /// At most `frameReadsAtOnce` reads run together; the rest wait their turn. Each read blocks its
    /// thread until its frame or its deadline, so the width is also the number of threads held.
    static let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "io.chatic.dou.attachment-picker.video-frame"
        queue.maxConcurrentOperationCount = AttachmentPickerCore.frameReadsAtOnce
        queue.qualityOfService = .userInitiated
        return queue
    }()

    /// The frame as `{ base64, contentType, width, height }`, or `UNREADABLE`.
    ///
    /// One deadline covers both waits — the duration (which needs the file's index from the network)
    /// and the frame — and each wait that runs out cancels what it waited on, so a read that timed out
    /// stops downloading instead of finishing for nobody.
    static func read(_ request: AttachmentPickerCore.FrameRequest) throws -> [String: Any] {
        let deadline = DispatchTime.now() + AttachmentPickerCore.frameTimeoutSeconds
        let asset = AVURLAsset(url: request.url)

        // The duration only moves the frame time to 0 for a short video; a source whose duration
        // cannot be loaded at all (403, not a video) cannot give a frame either, so it ends here.
        let durationLoaded = DispatchSemaphore(value: 0)
        let duration = WaitBox<CMTime?>(nil)
        let durationTask = Task.detached {
            duration.value = try? await asset.load(.duration)
            durationLoaded.signal()
        }
        guard durationLoaded.wait(timeout: deadline) == .success else {
            durationTask.cancel()
            asset.cancelLoading()
            throw Rejection(code: "UNREADABLE", message: "the video did not answer in time")
        }
        guard let loaded = duration.value else {
            throw Rejection(code: "UNREADABLE", message: "the video cannot be opened")
        }
        let durationMs = loaded.isNumeric ? loaded.seconds * 1000 : nil
        let timeMs = AttachmentPickerCore.frameTimeMs(atMs: request.atMs, durationMs: durationMs)

        let generator = VideoPreparation.frameGenerator(for: asset, longSide: CGFloat(request.maxEdge))
        let frameReady = DispatchSemaphore(value: 0)
        let frame = WaitBox<CGImage?>(nil)
        let failure = WaitBox<String?>(nil)
        // Through seconds rather than a millisecond count: Core Media saturates a huge `atMs` on a
        // video of unknown length to a time the generator refuses, where an Int64 conversion would trap.
        let time = CMTime(seconds: timeMs / 1000, preferredTimescale: 600)
        generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: time)]) { _, image, _, result, error in
            frame.value = image
            // The generator's own reason, so a refusal in the log says more than "no frame".
            if image == nil { failure.value = "result \(result.rawValue): \(error.map { TransferText.sanitize($0.localizedDescription) } ?? "none")" }
            frameReady.signal()
        }
        guard frameReady.wait(timeout: deadline) == .success else {
            generator.cancelAllCGImageGeneration()
            asset.cancelLoading()
            throw Rejection(code: "UNREADABLE", message: "the frame did not arrive in time")
        }
        guard let image = frame.value else {
            throw Rejection(code: "UNREADABLE", message: "the video has no frame there (\(failure.value ?? "no reason"))")
        }

        // The poster's encoding: quality 0.7 down until it is within the server's thumbnail slot.
        let still = UIImage(cgImage: image)
        guard let data = AttachmentPickerCore.firstFitting(encode: { still.jpegData(compressionQuality: CGFloat($0)) }) else {
            throw Rejection(code: "UNREADABLE", message: "the frame does not fit the poster size")
        }
        return [
            "base64": data.base64EncodedString(),
            "contentType": "image/jpeg",
            "width": image.width,
            "height": image.height,
        ]
    }
}

/// A value handed back from a callback or a task to the thread waiting on it. The waiter reads it
/// only after the writer's signal, so the semaphore orders the two; the box only makes the hand-over
/// expressible without capturing a `var` in concurrently running code.
final class WaitBox<Value>: @unchecked Sendable {
    var value: Value

    init(_ value: Value) {
        self.value = value
    }
}

/// Lets the background observer reach the running export. `cancelExport` may be called from any thread.
private final class ExportHandle: @unchecked Sendable {
    let session: AVAssetExportSession

    init(_ session: AVAssetExportSession) {
        self.session = session
    }
}
