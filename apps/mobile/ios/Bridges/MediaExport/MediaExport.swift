import Foundation
import Photos
import QuickLook
import React
import UIKit
import UniformTypeIdentifiers

/// MediaExport — hands a file the transfer module downloaded to an OS surface: the photo library, the
/// share sheet, the QuickLook preview, or the export sheet.
///
/// It accepts only committed files inside the download folder (`DownloadFiles.checkExportable`) and
/// only the server's formats, told by their bytes (`DownloadFiles.exportFamily`). Rejections use the
/// codes of the media-export contract as the promise rejection code, so JS passes them on.
@objc(MediaExport)
final class MediaExport: NSObject {
    private static let queue = DispatchQueue(label: "io.chatic.dou.media-export")

    /// The preview or export sheet on screen, held until it answers. Main thread only.
    private static var presented: [NSObject] = []

    private struct Rejection: Error {
        let code: String
        let message: String
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    /// Adds the image or video with add-only access. The original bytes go in as the resource, so an
    /// animated GIF stays animated — decoding it into an image first would keep one frame. Nothing
    /// is read back afterwards: add-only access does not allow it, and a lookup would turn a
    /// successful save into a reported failure.
    @objc(saveToPhotoLibrary:resolve:reject:)
    func saveToPhotoLibrary(_ uri: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.queue.async {
            let file: URL
            let media: LibraryMedia
            do {
                let (exportable, family) = try Self.exportable(uri as String)
                file = exportable
                switch family {
                case let .image(image): media = .image(image)
                case .isoBmff: media = .mp4
                default: throw Rejection(code: "UNSUPPORTED_TYPE", message: "the file is not a PNG, JPEG, GIF or WebP image or an MP4 video")
                }
            } catch let rejection as Rejection {
                return reject(rejection.code, rejection.message, nil)
            } catch {
                return reject("INTERNAL", TransferText.sanitize(error.localizedDescription), nil)
            }

            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else {
                    // Denied or restricted: from here only the Settings app can change it.
                    return reject("PERMISSION_DENIED", "photo library access is not granted", nil)
                }
                PHPhotoLibrary.shared().performChanges({
                    let options = PHAssetResourceCreationOptions()
                    options.originalFilename = file.lastPathComponent
                    options.uniformTypeIdentifier = media.uniformTypeIdentifier
                    PHAssetCreationRequest.forAsset().addResource(with: media.resourceType, fileURL: file, options: options)
                }, completionHandler: { success, error in
                    // Not on the main thread; nothing here touches UI.
                    guard success else {
                        return reject("INTERNAL", TransferText.sanitize(error?.localizedDescription ?? "the photo library refused the file"), nil)
                    }
                    Self.queue.async { Self.removeCommitted(file) }
                    resolve(["mimeType": media.mimeType])
                })
            }
        }
    }

    /// Presents the system share sheet with the file alone — no text, which a receiving app would
    /// tend to take instead of the file. Answers once, when the sheet closes. On iPad the sheet is a
    /// popover and needs an anchor or the app crashes; the web button's position cannot be trusted
    /// outside the WebView, so the anchor is the bottom centre of the screen.
    ///
    /// The receiving app learns the type from the file URL's extension, which is the downloaded
    /// name's: a ZIP named `.docx` goes as a Word document. The bytes only decide whether it may go.
    @objc(shareFile:title:resolve:reject:)
    func shareFile(_ uri: NSString, title: NSString?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.queue.async {
            let file: URL
            do {
                (file, _) = try Self.exportable(uri as String)
            } catch let rejection as Rejection {
                return reject(rejection.code, rejection.message, nil)
            } catch {
                return reject("INTERNAL", TransferText.sanitize(error.localizedDescription), nil)
            }

            DispatchQueue.main.async {
                // A screen still on its way out cannot present: `present` would fail silently and the
                // sheet's handler would never answer, leaving the caller waiting.
                guard let presenter = Self.topViewController(), presenter.presentedViewController == nil else {
                    return reject("INTERNAL", "there is no screen free to show the share sheet on", nil)
                }
                let controller = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                if let popover = controller.popoverPresentationController {
                    let bounds = presenter.view.bounds
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: bounds.midX, y: bounds.maxY - 1, width: 1, height: 1)
                    popover.permittedArrowDirections = [.down]
                }
                var answered = false
                controller.completionWithItemsHandler = { activityType, completed, _, _ in
                    guard !answered else { return }
                    answered = true
                    var payload: [String: Any] = ["completed": completed]
                    if let activityType { payload["activityType"] = activityType.rawValue }
                    // The file stays: a receiving app may read it after the sheet has closed. The
                    // transfer's sweep removes it a day later.
                    resolve(payload)
                }
                presenter.present(controller, animated: true) {
                    guard controller.presentingViewController == nil, !answered else { return }
                    answered = true
                    reject("INTERNAL", "the share sheet could not be shown", nil)
                }
            }
        }
    }

    /// Shows the file in QuickLook, which carries its own share button, and answers when it closes.
    ///
    /// QuickLook is asked first whether it can draw the file: it opens an HWP all the same, as an
    /// empty page with the name and size, so a file it cannot preview is refused with `NO_HANDLER`
    /// and the web offers the share sheet instead.
    @objc(openFile:resolve:reject:)
    func openFile(_ uri: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.queue.async {
            let file: URL
            do {
                (file, _) = try Self.exportable(uri as String)
            } catch let rejection as Rejection {
                return reject(rejection.code, rejection.message, nil)
            } catch {
                return reject("INTERNAL", TransferText.sanitize(error.localizedDescription), nil)
            }

            DispatchQueue.main.async {
                guard QLPreviewController.canPreview(file as NSURL) else {
                    return reject("NO_HANDLER", "nothing on this device previews this file", nil)
                }
                guard let presenter = Self.topViewController(), presenter.presentedViewController == nil else {
                    return reject("INTERNAL", "there is no screen free to show the preview on", nil)
                }
                let preview = PreviewSession(file: file) { session in
                    Self.release(session)
                    resolve([:])
                }
                let controller = QLPreviewController()
                controller.dataSource = preview
                controller.delegate = preview
                Self.presented.append(preview)
                presenter.present(controller, animated: true) {
                    guard controller.presentingViewController == nil else { return }
                    Self.release(preview)
                    reject("INTERNAL", "the preview could not be shown", nil)
                }
            }
        }
    }

    /// Keeps the document where the user picks, through the export sheet, under `name` cleaned once
    /// more. The downloaded file stays where it is, so the web can open it afterwards; the sheet gets
    /// a link (or copy) of it under the new name, since it saves what it is given under that file's
    /// own name. Dismissing the sheet is `saved: false`, not a failure.
    @objc(saveFile:name:resolve:reject:)
    func saveFile(_ uri: NSString, name: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.queue.async {
            let staged: URL
            do {
                let (file, _) = try Self.exportable(uri as String)
                guard let saveName = DownloadFiles.saveFileName(name as String) else {
                    throw Rejection(code: "INVALID", message: "the name does not end in one of the server's formats")
                }
                staged = try Self.stage(file, as: saveName)
            } catch let rejection as Rejection {
                return reject(rejection.code, rejection.message, nil)
            } catch {
                return reject("INTERNAL", TransferText.sanitize(error.localizedDescription), nil)
            }

            DispatchQueue.main.async {
                let folder = staged.deletingLastPathComponent()
                guard let presenter = Self.topViewController(), presenter.presentedViewController == nil else {
                    Self.queue.async { try? FileManager.default.removeItem(at: folder) }
                    return reject("INTERNAL", "there is no screen free to show the export sheet on", nil)
                }
                let save = SaveSession(name: staged.lastPathComponent) { session, location in
                    Self.release(session)
                    // The sheet has copied the file by the time it answers.
                    Self.queue.async { try? FileManager.default.removeItem(at: folder) }
                    if let location {
                        resolve(["saved": true, "location": location])
                    } else {
                        resolve(["saved": false])
                    }
                }
                let controller = UIDocumentPickerViewController(forExporting: [staged], asCopy: true)
                controller.delegate = save
                controller.presentationController?.delegate = save
                Self.presented.append(save)
                presenter.present(controller, animated: true) {
                    guard controller.presentingViewController == nil, save.abandon() else { return }
                    Self.release(save)
                    Self.queue.async { try? FileManager.default.removeItem(at: folder) }
                    reject("INTERNAL", "the export sheet could not be shown", nil)
                }
            }
        }
    }

    // MARK: - Internals

    /// A file the shell may hand out, and the family its bytes are. Anything outside the server's
    /// formats is `UNSUPPORTED_TYPE` — which is also how a build before documents and videos answered
    /// them, so the web learns the same thing from either.
    private static func exportable(_ uri: String) throws -> (URL, DownloadFiles.ExportFamily) {
        let file: URL
        switch DownloadFiles.checkExportable(uri, root: TransferSessionOwner.downloadRoot) {
        case let .accepted(accepted):
            file = accepted
        case let .invalid(reason):
            throw Rejection(code: "INVALID", message: reason)
        case .missing:
            throw Rejection(code: "SOURCE", message: "the file no longer exists")
        }
        guard let handle = try? FileHandle(forReadingFrom: file) else {
            throw Rejection(code: "SOURCE", message: "the file cannot be read")
        }
        defer { try? handle.close() }
        guard let family = DownloadFiles.exportFamily(handle.readData(ofLength: DownloadFiles.familySniffBytes), fileName: file.lastPathComponent) else {
            throw Rejection(code: "UNSUPPORTED_TYPE", message: "the file is not one of the server's formats")
        }
        return (file, family)
    }

    /// `file` under `name`, in a folder of its own in the temporary directory: a hard link when the
    /// two share a volume (they do — both are in the app's container), else a copy.
    private static func stage(_ file: URL, as name: String) throws -> URL {
        let fm = FileManager.default
        let folder = fm.temporaryDirectory
            .appendingPathComponent("save-file", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let target = folder.appendingPathComponent(name)
        do {
            try fm.createDirectory(at: folder, withIntermediateDirectories: true)
            do {
                try fm.linkItem(at: file, to: target)
            } catch {
                try fm.copyItem(at: file, to: target)
            }
        } catch {
            try? fm.removeItem(at: folder)
            throw Rejection(code: "INTERNAL", message: TransferText.sanitize("cannot prepare the file: \(error.localizedDescription)"))
        }
        return target
    }

    private static func release(_ session: NSObject) {
        presented.removeAll { $0 === session }
    }

    /// Deletes the saved file and its transfer folder — but never the download folder itself.
    private static func removeCommitted(_ file: URL) {
        let fm = FileManager.default
        try? fm.removeItem(at: file)
        let parent = file.deletingLastPathComponent()
        let root = TransferSessionOwner.downloadRoot.resolvingSymlinksInPath().standardizedFileURL
        guard parent.resolvingSymlinksInPath().standardizedFileURL != root,
              (try? fm.contentsOfDirectory(atPath: parent.path))?.isEmpty == true
        else { return }
        try? fm.removeItem(at: parent)
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.flatMap(\.windows)
        var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

/// What the photo library is handed.
private enum LibraryMedia {
    case image(DownloadFiles.ImageType)
    case mp4

    var mimeType: String {
        switch self {
        case let .image(image): return image.mimeType
        case .mp4: return "video/mp4"
        }
    }

    var resourceType: PHAssetResourceType {
        switch self {
        case .image: return .photo
        case .mp4: return .video
        }
    }

    var uniformTypeIdentifier: String {
        switch self {
        case let .image(image): return image.uniformTypeIdentifier
        case .mp4: return "public.mpeg-4"
        }
    }
}

/// The QuickLook data source and delegate for one file, answering once when the preview closes.
private final class PreviewSession: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    private let file: URL
    private var onClose: ((PreviewSession) -> Void)?

    init(file: URL, onClose: @escaping (PreviewSession) -> Void) {
        self.file = file
        self.onClose = onClose
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        file as NSURL
    }

    func previewControllerDidDismiss(_ controller: QLPreviewController) {
        let close = onClose
        onClose = nil
        close?(self)
    }
}

/// The export sheet's delegate, answering once: the saved file's name, or `nil` when the user backed
/// out — the sheet has no cancel button, so a swipe down or "Stop" at the replace question is that.
private final class SaveSession: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    private let name: String
    private var onAnswer: ((SaveSession, String?) -> Void)?

    init(name: String, onAnswer: @escaping (SaveSession, String?) -> Void) {
        self.name = name
        self.onAnswer = onAnswer
    }

    func finish(_ location: String?) {
        let answer = onAnswer
        onAnswer = nil
        answer?(self, location)
    }

    /// Drops the answer without sending it, for a sheet that never appeared. False if it already answered.
    func abandon() -> Bool {
        guard onAnswer != nil else { return false }
        onAnswer = nil
        return true
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        // The name it was saved under, which "Keep Both" may have changed.
        finish(urls.first?.lastPathComponent ?? name)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(nil)
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish(nil)
    }
}

private extension DownloadFiles.ImageType {
    /// The type identifier PhotoKit stores the resource as.
    var uniformTypeIdentifier: String {
        switch self {
        case .png: return "public.png"
        case .jpeg: return "public.jpeg"
        case .gif: return "com.compuserve.gif"
        case .webp: return "org.webmproject.webp"
        }
    }
}
