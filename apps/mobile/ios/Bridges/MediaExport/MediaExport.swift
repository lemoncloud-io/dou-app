import Foundation
import Photos
import React
import UIKit

/// MediaExport — hands a file the transfer module downloaded to an OS surface: the photo library or
/// the share sheet.
///
/// It accepts only committed files inside the download folder (`DownloadFiles.checkExportable`) and
/// only images, told by their bytes (`DownloadFiles.sniffImage`). Rejections use the codes of the
/// `SaveToPhotoLibrary` / `ShareFile` contract as the promise rejection code, so JS passes them on.
@objc(MediaExport)
final class MediaExport: NSObject {
    private static let queue = DispatchQueue(label: "io.chatic.dou.media-export")

    private struct Rejection: Error {
        let code: String
        let message: String
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    /// Adds the image with add-only access. The original bytes go in as the photo resource, so an
    /// animated GIF stays animated — decoding it into an image first would keep one frame. Nothing
    /// is read back afterwards: add-only access does not allow it, and a lookup would turn a
    /// successful save into a reported failure.
    @objc(saveToPhotoLibrary:resolve:reject:)
    func saveToPhotoLibrary(_ uri: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.queue.async {
            let file: URL
            let type: DownloadFiles.ImageType
            do {
                (file, type) = try Self.exportableImage(uri as String)
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
                    options.uniformTypeIdentifier = type.uniformTypeIdentifier
                    PHAssetCreationRequest.forAsset().addResource(with: .photo, fileURL: file, options: options)
                }, completionHandler: { success, error in
                    // Not on the main thread; nothing here touches UI.
                    guard success else {
                        return reject("INTERNAL", TransferText.sanitize(error?.localizedDescription ?? "the photo library refused the image"), nil)
                    }
                    Self.queue.async { Self.removeCommitted(file) }
                    resolve(["mimeType": type.mimeType])
                })
            }
        }
    }

    /// Presents the system share sheet with the file alone — no text, which a receiving app would
    /// tend to take instead of the file. Answers once, when the sheet closes. On iPad the sheet is a
    /// popover and needs an anchor or the app crashes; the web button's position cannot be trusted
    /// outside the WebView, so the anchor is the bottom centre of the screen.
    @objc(shareFile:title:resolve:reject:)
    func shareFile(_ uri: NSString, title: NSString?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.queue.async {
            let file: URL
            do {
                (file, _) = try Self.exportableImage(uri as String)
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

    // MARK: - Internals

    private static func exportableImage(_ uri: String) throws -> (URL, DownloadFiles.ImageType) {
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
        guard let type = DownloadFiles.sniffImage(handle.readData(ofLength: DownloadFiles.sniffBytes)) else {
            throw Rejection(code: "UNSUPPORTED_TYPE", message: "the file is not a PNG, JPEG, GIF or WebP image")
        }
        return (file, type)
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
