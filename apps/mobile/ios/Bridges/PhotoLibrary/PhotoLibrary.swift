import Foundation
import Photos
import PhotosUI
import React
import UIKit

/// PhotoLibrary — reads the device photo library for the web's in-app picker: albums, pages of
/// previews, the bytes of a picked photo, and a picked video kept as a file.
///
/// A list holds the media types its request names (`mediaTypes`) and still images when it names
/// none, so a caller that cannot send a video never sees one. Previews and photos cross as base64 because the WebView cannot
/// open a `ph://` identifier; the identifiers themselves are handed to the web only to be handed back.
/// A video never crosses: `keepLibraryVideo` copies it into the attachment picker's folders and
/// answers with the copy's `file://` URI, which PrepareVideo and the transfer take as they take a
/// picked video.
///
/// Rejection codes never include `NOT_FOUND`: the web reads that code as "this app has no photo
/// library" and stops asking for the rest of the session, so a deleted photo must not look like it.
@objc(PhotoLibrary)
final class PhotoLibrary: NSObject {
    /// Lists run one at a time. The web drops a page it no longer wants (an album switched away from)
    /// but cannot cancel it, so letting them overlap would only have several pages of synchronous
    /// thumbnail requests competing for threads, with the one still wanted finishing last.
    private static let listQueue = DispatchQueue(label: "io.chatic.dou.photo-library.list", qos: .userInitiated)
    /// Reads get their own queue, so sending a photo does not wait behind a page of previews.
    private static let readQueue = DispatchQueue(label: "io.chatic.dou.photo-library.read", qos: .userInitiated)
    /// Kept videos get a third: a copy can wait minutes on an iCloud download, and photos read for the
    /// same message should not queue behind it. One at a time — the web sends them one by one anyway,
    /// and each holds a full video's write.
    private static let videoQueue = DispatchQueue(label: "io.chatic.dou.photo-library.video", qos: .userInitiated)

    private struct Rejection: Error {
        let code: String
        let message: String
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Methods

    @objc(listAlbums:resolve:reject:)
    func listAlbums(_ request: NSDictionary?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let types = PhotoLibraryCore.mediaTypes(request?["mediaTypes"])
        let size = PhotoLibraryCore.thumbSize(request?["thumbSize"])

        Self.withAccess { authorization in
            let access = PhotoLibraryCore.access(authorization)
            guard access != "denied" else { return resolve(["access": access, "albums": []]) }
            resolve(["access": access, "albums": Self.albums(types, size: size)])
        }
    }

    @objc(listPhotos:resolve:reject:)
    func listPhotos(_ request: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let albumId = request["albumId"] as? String
        let after = request["after"] as? String
        let limit = (request["limit"] as? NSNumber)?.intValue ?? 0
        let types = PhotoLibraryCore.mediaTypes(request["mediaTypes"])
        let size = PhotoLibraryCore.thumbSize(request["thumbSize"])
        let offset = PhotoLibraryCore.offset(request["offset"])

        Self.withAccess { authorization in
            let access = PhotoLibraryCore.access(authorization)
            guard access != "denied" else { return resolve(["access": access, "items": []]) }
            if let offset {
                return resolve(Self.photos(albumId: albumId, types: types, offset: offset, limit: limit, size: size, access: access))
            }
            resolve(Self.photos(albumId: albumId, types: types, after: after, limit: limit, size: size, access: access))
        }
    }

    @objc(readPhoto:resolve:reject:)
    func readPhoto(_ id: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.readQueue.async {
            do {
                resolve(try Self.read(id as String))
            } catch let rejection as Rejection {
                reject(rejection.code, rejection.message, nil)
            } catch {
                reject("INTERNAL", error.localizedDescription, nil)
            }
        }
    }

    /// Copies one library video into a new `attach-pick/<uuid>/` folder and answers with the item a
    /// pick answers for a video. Refusals: `INVALID` (no id, or an asset that is not a video),
    /// `PHOTO_MISSING` (no such asset, or not shared under limited access), `READ_FAILED` (the copy or
    /// its iCloud download failed, or the copy's tracks cannot be read) and `TOO_LARGE`.
    @objc(keepLibraryVideo:resolve:reject:)
    func keepLibraryVideo(_ id: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.videoQueue.async {
            do {
                resolve(try Self.keepVideo(id as String))
            } catch let rejection as Rejection {
                reject(rejection.code, rejection.message, nil)
            } catch {
                reject("INTERNAL", error.localizedDescription, nil)
            }
        }
    }

    /// The iOS "select more photos" sheet. Outside limited access there is no selection to manage, so
    /// the current access comes straight back.
    @objc(manageSelection:reject:)
    func manageSelection(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard current == .limited else { return resolve(PhotoLibraryCore.access(Self.authorization(current))) }

        DispatchQueue.main.async {
            // A controller mid-transition refuses the presentation without calling back, which would
            // leave the web's request hanging until it times out; answer at once instead.
            guard let presenter = Self.topViewController(), !presenter.isBeingDismissed, !presenter.isBeingPresented else {
                return resolve(PhotoLibraryCore.access(.limited))
            }
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: presenter) { _ in
                resolve(PhotoLibraryCore.access(Self.authorization(PHPhotoLibrary.authorizationStatus(for: .readWrite))))
            }
        }
    }

    /// The controller on top of the key window, which the system sheet has to be presented from.
    private static func topViewController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } }
            .first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    // MARK: - Access

    /// Asks once when the user has not been asked yet — the first list is what raises the system
    /// prompt, so it appears when the attach menu opens rather than at launch.
    private static func withAccess(_ body: @escaping (PhotoLibraryCore.Authorization) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .notDetermined else {
            return listQueue.async { body(authorization(status)) }
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { granted in
            listQueue.async { body(authorization(granted)) }
        }
    }

    private static func authorization(_ status: PHAuthorizationStatus) -> PhotoLibraryCore.Authorization {
        switch status {
        case .authorized: return .authorized
        case .limited: return .limited
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }

    // MARK: - Albums

    /// Smart albums worth switching to, after "all photos". Hidden and Recently Deleted are left out on
    /// purpose; the rest of the smart albums are either empty for most people or hold only videos
    /// (slo-mo, time-lapse), and of those just "Videos" is offered, when videos are listed at all.
    private static func smartAlbums(_ types: Set<PhotoLibraryCore.MediaType>) -> [PHAssetCollectionSubtype] {
        [.smartAlbumFavorites]
            + (types.contains(.video) ? [.smartAlbumVideos] : [])
            + stillAlbums
    }

    private static let stillAlbums: [PHAssetCollectionSubtype] = [
        .smartAlbumSelfPortraits,
        .smartAlbumScreenshots,
        .smartAlbumLivePhotos,
        .smartAlbumPanoramas,
        .smartAlbumDepthEffect,
        .smartAlbumAnimated,
        .smartAlbumBursts,
    ]

    /// Newest first, only the media types asked for — the same order and filter every album count,
    /// cover and page uses, so a count never disagrees with the pages behind it.
    private static func fetchOptions(_ types: Set<PhotoLibraryCore.MediaType>) -> PHFetchOptions {
        let options = PHFetchOptions()
        let raw = types.map { type -> Int in
            switch type {
            case .image: return PHAssetMediaType.image.rawValue
            case .video: return PHAssetMediaType.video.rawValue
            }
        }
        options.predicate = NSPredicate(format: "mediaType IN %@", raw)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        return options
    }

    private static func userLibrary() -> PHAssetCollection? {
        PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .smartAlbumUserLibrary, options: nil).firstObject
    }

    private static func albums(_ types: Set<PhotoLibraryCore.MediaType>, size: Int?) -> [[String: Any]] {
        let library = userLibrary()
        let all = library.map { PHAsset.fetchAssets(in: $0, options: fetchOptions(types)) } ?? PHAsset.fetchAssets(with: fetchOptions(types))
        var first: [String: Any] = [
            "id": PhotoLibraryCore.allPhotosAlbumId,
            "title": library?.localizedTitle ?? NSLocalizedString("photo_library_all_photos", comment: ""),
            "count": all.count,
        ]
        if let newest = all.firstObject, let cover = thumbnail(newest, size: size) { first["coverBase64"] = cover }

        var collections: [PHAssetCollection] = []
        for subtype in smartAlbums(types) {
            PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: subtype, options: nil)
                .enumerateObjects { collection, _, _ in collections.append(collection) }
        }
        // Shared albums are left out: their photos live in iCloud, so every cover and page would be a
        // download, and they are other people's photos rather than the user's own library.
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
            .enumerateObjects { collection, _, _ in
                if collection.assetCollectionSubtype != .albumCloudShared { collections.append(collection) }
            }

        // "All photos" stays first even when empty: the web treats the first album as the whole
        // library. Every other album is listed only when it holds something of the asked types this
        // app can see — so "Videos" never shows up empty, and a video-only album not at all for photos.
        let rest: [[String: Any]] = collections.compactMap { collection in
            let assets = PHAsset.fetchAssets(in: collection, options: fetchOptions(types))
            guard assets.count > 0 else { return nil }
            var album: [String: Any] = [
                "id": collection.localIdentifier,
                "title": collection.localizedTitle ?? "",
                "count": assets.count,
            ]
            if let newest = assets.firstObject, let cover = thumbnail(newest, size: size) { album["coverBase64"] = cover }
            return album
        }
        return [first] + rest
    }

    // MARK: - Photos

    /// An album that is gone (deleted, or no longer shared under limited access) lists as empty rather
    /// than failing, so the grid shows nothing instead of retrying forever.
    private static func assets(albumId: String?, types: Set<PhotoLibraryCore.MediaType>) -> PHFetchResult<PHAsset>? {
        let options = fetchOptions(types)
        guard !PhotoLibraryCore.isAllPhotos(albumId), let albumId else {
            guard let library = userLibrary() else { return PHAsset.fetchAssets(with: options) }
            return PHAsset.fetchAssets(in: library, options: options)
        }
        guard let collection = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [albumId], options: nil).firstObject else {
            return nil
        }
        return PHAsset.fetchAssets(in: collection, options: options)
    }

    private static func photos(
        albumId: String?, types: Set<PhotoLibraryCore.MediaType>, after: String?, limit: Int, size: Int?, access: String
    ) -> [String: Any] {
        guard let assets = assets(albumId: albumId, types: types) else { return ["access": access, "items": []] }

        let cursor = PhotoLibraryCore.decode(after)
        let anchorIndex = cursor.flatMap { cursor -> Int? in
            guard let anchor = PHAsset.fetchAssets(withLocalIdentifiers: [cursor.anchorId], options: nil).firstObject else { return nil }
            let index = assets.index(of: anchor)
            return index == NSNotFound ? nil : index
        }
        let start = PhotoLibraryCore.resumeIndex(cursor, anchorIndex: anchorIndex)
        let page = PhotoLibraryCore.page(start: start, limit: limit, total: assets.count)

        var items: [[String: Any]] = []
        var last: PHAsset?
        for index in page.range {
            let asset = assets.object(at: index)
            last = asset
            // A photo with no preview on the device is skipped rather than drawn as a blank tile. A
            // video's preview is a frame PhotoKit renders the same way, so the rule holds for both.
            guard let thumb = thumbnail(asset, size: size) else { continue }
            items.append(item(asset, thumb: thumb))
        }

        var reply: [String: Any] = ["access": access, "items": items]
        if page.hasMore, let last {
            reply["next"] = PhotoLibraryCore.encode(.init(offset: page.range.upperBound, anchorId: last.localIdentifier))
        }
        return reply
    }

    /// A page cut by index: the items at `offset` onward in the same list the cursor pages walk. Every
    /// index answers its own item — one without a preview is listed with an empty one rather than left
    /// out, because the web places each item by its index. The reply echoes where the page starts and
    /// how long the list is now, and never carries `next`.
    private static func photos(
        albumId: String?, types: Set<PhotoLibraryCore.MediaType>, offset: Int, limit: Int, size: Int?, access: String
    ) -> [String: Any] {
        guard let assets = assets(albumId: albumId, types: types) else {
            return ["access": access, "items": [], "offset": 0, "total": 0]
        }

        let total = assets.count
        let page = PhotoLibraryCore.page(start: offset, limit: limit, total: total)
        let items = page.range.map { index -> [String: Any] in
            let asset = assets.object(at: index)
            return item(asset, thumb: thumbnail(asset, size: size) ?? "")
        }
        return ["access": access, "items": items, "offset": page.range.lowerBound, "total": total]
    }

    private static func item(_ asset: PHAsset, thumb: String) -> [String: Any] {
        var item: [String: Any] = [
            "id": asset.localIdentifier,
            "thumbBase64": thumb,
            "width": asset.pixelWidth,
            "height": asset.pixelHeight,
            "mediaType": (asset.mediaType == .video ? PhotoLibraryCore.MediaType.video : .image).rawValue,
        ]
        if asset.mediaType == .video { item["durationMs"] = PhotoLibraryCore.durationMs(seconds: asset.duration) }
        return item
    }

    /// A preview from what is already on the device. iCloud is never asked: a page is 60 synchronous
    /// requests in a row, and on a slow or absent network each one would wait out its own download
    /// until the web's request timed out. Photos keeps small renditions of every photo locally, so the
    /// fast rendition is the fallback when a sharper one is not there.
    ///
    /// Without `size` the preview is the one this bridge always answered: about 256 px on the long edge,
    /// uncropped. With it, the preview is the photo's centre square, `size` pixels a side.
    private static func thumbnail(_ asset: PHAsset, size: Int?) -> String? {
        // One pool per preview: a page makes up to 200 in a row on one queue, and the decoded image,
        // the drawn square and the JPEG data are autoreleased — without a pool here they would all
        // stay alive until the whole page is done.
        autoreleasepool {
            guard let size else {
                let edge = CGFloat(PhotoLibraryCore.thumbnailEdge)
                let image = localImage(asset, size: CGSize(width: edge, height: edge), mode: .highQualityFormat, resize: .fast)
                    ?? localImage(asset, size: CGSize(width: edge, height: edge), mode: .fastFormat, resize: .fast)
                return image?.jpegData(compressionQuality: 0.7)?.base64EncodedString()
            }
            return squareThumbnail(asset, size: size)
        }
    }

    /// The centre square of the photo at `size` pixels a side, cut from an image requested just large
    /// enough that its short side is `size`. `.exact` is asked for so PhotoKit scales to that box rather
    /// than handing back whichever cached rendition is nearest, which can be smaller than the tile.
    /// The crop is measured on the image PhotoKit returned, not on the asset's dimensions: the fast
    /// rendition is smaller, and a stored size need not match the orientation it is drawn in.
    private static func squareThumbnail(_ asset: PHAsset, size: Int) -> String? {
        let box = PhotoLibraryCore.fitBox(width: asset.pixelWidth, height: asset.pixelHeight, size: size)
        let target = CGSize(width: box, height: box)
        guard let image = localImage(asset, size: target, mode: .highQualityFormat, resize: .exact)
            ?? localImage(asset, size: target, mode: .fastFormat, resize: .exact) else { return nil }

        // `size` already accounts for the image's orientation; times `scale`, it is the upright pixels.
        let width = Int((image.size.width * image.scale).rounded())
        let height = Int((image.size.height * image.scale).rounded())
        guard width > 0, height > 0 else { return nil }
        let crop = PhotoLibraryCore.centerSquare(width: width, height: height)
        let side = PhotoLibraryCore.squareSide(size: size, width: crop.side, height: crop.side)

        // Drawing the whole image scaled into an aspect-fill rect cuts the crop and the scale in one
        // pass, and `draw(in:)` applies the image's orientation, so the square comes out upright.
        let factor = CGFloat(side) / CGFloat(crop.side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let square = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            image.draw(in: CGRect(
                x: -CGFloat(crop.x) * factor,
                y: -CGFloat(crop.y) * factor,
                width: CGFloat(width) * factor,
                height: CGFloat(height) * factor
            ))
        }
        return square.jpegData(compressionQuality: PhotoLibraryCore.sizedJpegQuality)?.base64EncodedString()
    }

    private static func localImage(
        _ asset: PHAsset, size: CGSize, mode: PHImageRequestOptionsDeliveryMode, resize: PHImageRequestOptionsResizeMode
    ) -> UIImage? {
        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.deliveryMode = mode
        options.resizeMode = resize
        options.isNetworkAccessAllowed = false

        var image: UIImage?
        PHImageManager.default().requestImage(for: asset, targetSize: size, contentMode: .aspectFit, options: options) { result, _ in
            image = result
        }
        return image
    }

    // MARK: - Read

    /// The photo the user chose to send, fetched from iCloud if it has to be — unlike a preview, this is
    /// worth the wait, and the web gives it a longer timeout for that.
    private static func read(_ id: String) throws -> [String: Any] {
        guard !id.isEmpty else { throw Rejection(code: "INVALID", message: "id is required") }
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            throw Rejection(code: "PHOTO_MISSING", message: "The photo is no longer in the library")
        }
        // A video id reaches here only by mistake now that the grid lists videos; its image data would
        // be a still frame sent as a photo, so it is refused, and the web sends it with keepLibraryVideo.
        guard asset.mediaType == .image else { throw Rejection(code: "INVALID", message: "The id is not a photo") }

        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.version = .current
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true

        var data: Data?
        var uti: String?
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { result, type, _, _ in
            data = result
            uti = type
        }
        guard let data else { throw Rejection(code: "READ_FAILED", message: "The photo could not be read") }
        guard let prepared = PhotoLibraryCore.prepare(data, typeIdentifier: uti) else {
            throw Rejection(code: "READ_FAILED", message: "The photo could not be converted")
        }

        let resources = PHAssetResource.assetResources(for: asset)
        let original = (resources.first { $0.type == .photo } ?? resources.first)?.originalFilename
        return [
            "base64": prepared.data.base64EncodedString(),
            "mimeType": prepared.mimeType,
            "fileName": PhotoLibraryCore.fileName(original: original, fileExtension: prepared.fileExtension),
            "width": asset.pixelWidth,
            "height": asset.pixelHeight,
        ]
    }

    // MARK: - Keep video

    /// The video the user chose to send, copied whole — downloaded from iCloud first if it has to be,
    /// which the web allows ten minutes for — and then judged exactly as a picked video is
    /// (`AttachmentPicker.keepVideo`). Unlike a pick, a video that will be converted is held to the
    /// conversion's size estimate now, so one PrepareVideo would refuse never becomes a pending message.
    private static func keepVideo(_ id: String) throws -> [String: Any] {
        guard !id.isEmpty else { throw Rejection(code: "INVALID", message: "id is required") }
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            throw Rejection(code: "PHOTO_MISSING", message: "The video is no longer in the library")
        }
        guard asset.mediaType == .video else { throw Rejection(code: "INVALID", message: "The id is not a video") }

        let resources = PHAssetResource.assetResources(for: asset)
        let described = resources.map { resource in
            AttachmentPickerCore.LibraryVideoResource(kind: resourceKind(resource.type), originalFilename: resource.originalFilename)
        }
        guard let copy = AttachmentPickerCore.libraryVideoCopy(described) else {
            throw Rejection(code: "READ_FAILED", message: "The video has no file to copy")
        }
        let resource = resources[copy.index]

        // The sweep a pick runs first, on this queue rather than the pick's: it only removes folders
        // untouched for a day, which no copy in progress can be.
        AttachmentPicker.sweep()
        let folder: URL
        do {
            folder = try AttachmentPicker.newFolder()
        } catch {
            throw Rejection(code: "READ_FAILED", message: error.localizedDescription)
        }
        let target = folder.appendingPathComponent(copy.name)

        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        let written = DispatchSemaphore(value: 0)
        let failure = WaitBox<Error?>(nil)
        PHAssetResourceManager.default().writeData(for: resource, toFile: target, options: options) { error in
            failure.value = error
            written.signal()
        }
        written.wait()
        if let error = failure.value {
            try? FileManager.default.removeItem(at: folder)
            throw Rejection(code: "READ_FAILED", message: error.localizedDescription)
        }

        // The server's video ceiling. A pick is given it by the web; this call is not, and the
        // ceiling is the same number the conversion is held to.
        let max = AttachmentPickerCore.MaxBytes(image: 0, video: AttachmentPickerCore.exportLimitBytes, file: 0)
        switch AttachmentPicker.keepVideo(target, typeIdentifier: resource.uniformTypeIdentifier, max: max, estimateConversion: true) {
        case let .kept(item):
            return item
        case .refused(.tooLarge):
            throw Rejection(code: "TOO_LARGE", message: "The video is over the size limit")
        case .refused(.unreadable):
            throw Rejection(code: "READ_FAILED", message: "The copied video cannot be read")
        }
    }

    private static func resourceKind(_ type: PHAssetResourceType) -> AttachmentPickerCore.LibraryVideoResource.Kind {
        switch type {
        case .video: return .video
        case .fullSizeVideo: return .fullSizeVideo
        default: return .other
        }
    }
}
