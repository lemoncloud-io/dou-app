import AVFoundation
import Foundation
import ImageIO
import PhotosUI
import React
import UIKit
import UniformTypeIdentifiers

/// AttachmentPicker — picks photos, videos and documents for a chat message and keeps them in the
/// shell, makes a picked video ready to upload, and reads a picked photo's bytes.
///
/// Everything picked is copied into `Caches/attach-pick/<uuid>/` and handed to the web as a `file://`
/// URI. A video's or document's bytes never cross the bridge: the transfer uploads it from there. A
/// photo is kept prepared exactly as the in-app photo grid prepares one (`PhotoLibraryCore.prepare`),
/// and its bytes cross later, one photo per `readAttachment`, because the web prepares every photo
/// itself — ten photos in the pick's own answer would be one message of some 200 MB of base64.
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

    /// The server's seven document formats. HWP and HWPX have no system type, so they are named by
    /// their extension; that type matches any file with it, and is the installed Hancom app's own
    /// type when there is one.
    private static var documentTypes: [UTType] {
        [.pdf, .plainText] + ["docx", "xlsx", "pptx", "hwp", "hwpx"].compactMap { UTType(filenameExtension: $0, conformingTo: .data) }
    }

    /// Deletes pick folders untouched for a day. A folder's age is its newest change, so one whose
    /// video was converted an hour ago is kept even when it was picked yesterday.
    private static func sweep() {
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

        let suggested = provider.suggestedName ?? ""
        guard let file = copied, let size = AttachmentPicker.fileSize(file),
              let facts = VideoPreparation.facts(of: file)
        else {
            if let copied { try? FileManager.default.removeItem(at: copied.deletingLastPathComponent()) }
            return collected.refuse(copied?.lastPathComponent ?? suggested, kind: .video, .unreadable)
        }
        let needsExport = AttachmentPickerCore.needsExport(facts)
        if AttachmentPickerCore.isTooLarge(kind: .video, size: size, needsExport: needsExport, max: max) {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
            return collected.refuse(file.lastPathComponent, kind: .video, .tooLarge)
        }
        var item: [String: Any] = [
            "kind": "video",
            "uri": file.absoluteString,
            "name": file.lastPathComponent,
            "contentType": UTType(type)?.preferredMIMEType ?? UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
                ?? "application/octet-stream",
            "size": NSNumber(value: size),
        ]
        if needsExport { item["needsExport"] = true }
        collected.items.append(item)
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
        let name = AttachmentPickerCore.diskName(url.lastPathComponent, fallback: "file")
        guard let size = AttachmentPicker.fileSize(url) else { return collected.refuse(name, kind: .file, .unreadable) }
        if AttachmentPickerCore.isTooLarge(kind: .file, size: size, needsExport: false, max: max) {
            try? fm.removeItem(at: url)
            return collected.refuse(name, kind: .file, .tooLarge)
        }
        // Read before the move: the type is the system's for this file, HWP's usually none.
        let contentType = (try? url.resourceValues(forKeys: [.contentTypeKey]))?.contentType?.preferredMIMEType
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

    /// Converts at 1080p, or at 720p when 1080p's estimate is over the limit, into `target`. The export
    /// writes a hidden file of its own first and replaces `target` only once it is complete, so a name
    /// that already holds the source (`clip.mp4` in HEVC) is never left half written.
    private static func convert(_ asset: AVURLAsset, to target: URL) async throws -> URL {
        var preset = AttachmentPickerCore.ExportPreset.p1080
        var chosen: AVAssetExportSession?
        while chosen == nil {
            guard let candidate = AVAssetExportSession(asset: asset, presetName: presetName(preset)) else {
                throw Rejection(code: "SYSTEM", message: "the video cannot be converted")
            }
            // The async estimate; the old synchronous `estimatedOutputFileLength` answers 0 here.
            let estimate = try? await candidate.estimatedOutputFileLengthInBytes
            switch AttachmentPickerCore.sizeStep(preset: preset, estimatedBytes: estimate) {
            case .export:
                chosen = candidate
            case let .stepDown(next):
                preset = next
            case .tooLarge:
                throw Rejection(code: "TOO_LARGE", message: "the video is over the size limit even at 720p")
            }
        }
        guard let session = chosen else { throw Rejection(code: "SYSTEM", message: "the video cannot be converted") }

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
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        let side = CGFloat(AttachmentPickerCore.posterLongSide)
        generator.maximumSize = CGSize(width: side, height: side)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero

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
}

/// Lets the background observer reach the running export. `cancelExport` may be called from any thread.
private final class ExportHandle: @unchecked Sendable {
    let session: AVAssetExportSession

    init(_ session: AVAssetExportSession) {
        self.session = session
    }
}
