import Foundation
import Photos
import PhotosUI
import React
import UIKit

/// PhotoLibrary — reads the device photo library for the web's in-app picker: albums, pages of
/// previews, and the bytes of a picked photo.
///
/// Only still images are listed. Everything crosses as base64 because the WebView cannot open a
/// `ph://` identifier; the identifiers themselves are handed to the web only to be handed back.
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

    private struct Rejection: Error {
        let code: String
        let message: String
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Methods

    @objc(listAlbums:reject:)
    func listAlbums(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Self.withAccess { authorization in
            let access = PhotoLibraryCore.access(authorization)
            guard access != "denied" else { return resolve(["access": access, "albums": []]) }
            resolve(["access": access, "albums": Self.albums()])
        }
    }

    @objc(listPhotos:resolve:reject:)
    func listPhotos(_ request: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let albumId = request["albumId"] as? String
        let after = request["after"] as? String
        let limit = (request["limit"] as? NSNumber)?.intValue ?? 0

        Self.withAccess { authorization in
            let access = PhotoLibraryCore.access(authorization)
            guard access != "denied" else { return resolve(["access": access, "items": []]) }
            resolve(Self.photos(albumId: albumId, after: after, limit: limit, access: access))
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
    /// purpose; the rest of the smart albums are either video or empty for most people.
    private static let smartAlbums: [PHAssetCollectionSubtype] = [
        .smartAlbumFavorites,
        .smartAlbumSelfPortraits,
        .smartAlbumScreenshots,
        .smartAlbumLivePhotos,
        .smartAlbumPanoramas,
        .smartAlbumDepthEffect,
        .smartAlbumAnimated,
        .smartAlbumBursts,
    ]

    /// Newest first, still images only — the same order and filter every page uses.
    private static func imageOptions() -> PHFetchOptions {
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        return options
    }

    private static func userLibrary() -> PHAssetCollection? {
        PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .smartAlbumUserLibrary, options: nil).firstObject
    }

    private static func albums() -> [[String: Any]] {
        let library = userLibrary()
        let all = library.map { PHAsset.fetchAssets(in: $0, options: imageOptions()) } ?? PHAsset.fetchAssets(with: imageOptions())
        var first: [String: Any] = [
            "id": PhotoLibraryCore.allPhotosAlbumId,
            "title": library?.localizedTitle ?? NSLocalizedString("photo_library_all_photos", comment: ""),
            "count": all.count,
        ]
        if let newest = all.firstObject, let cover = thumbnail(newest) { first["coverBase64"] = cover }

        var collections: [PHAssetCollection] = []
        for subtype in smartAlbums {
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
        // library. Every other album is listed only when it holds a photo this app can see.
        let rest: [[String: Any]] = collections.compactMap { collection in
            let assets = PHAsset.fetchAssets(in: collection, options: imageOptions())
            guard assets.count > 0 else { return nil }
            var album: [String: Any] = [
                "id": collection.localIdentifier,
                "title": collection.localizedTitle ?? "",
                "count": assets.count,
            ]
            if let newest = assets.firstObject, let cover = thumbnail(newest) { album["coverBase64"] = cover }
            return album
        }
        return [first] + rest
    }

    // MARK: - Photos

    /// An album that is gone (deleted, or no longer shared under limited access) lists as empty rather
    /// than failing, so the grid shows nothing instead of retrying forever.
    private static func assets(albumId: String?) -> PHFetchResult<PHAsset>? {
        guard !PhotoLibraryCore.isAllPhotos(albumId), let albumId else {
            guard let library = userLibrary() else { return PHAsset.fetchAssets(with: imageOptions()) }
            return PHAsset.fetchAssets(in: library, options: imageOptions())
        }
        guard let collection = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [albumId], options: nil).firstObject else {
            return nil
        }
        return PHAsset.fetchAssets(in: collection, options: imageOptions())
    }

    private static func photos(albumId: String?, after: String?, limit: Int, access: String) -> [String: Any] {
        guard let assets = assets(albumId: albumId) else { return ["access": access, "items": []] }

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
            // A photo with no preview on the device is skipped rather than drawn as a blank tile.
            guard let thumb = thumbnail(asset) else { continue }
            items.append([
                "id": asset.localIdentifier,
                "thumbBase64": thumb,
                "width": asset.pixelWidth,
                "height": asset.pixelHeight,
            ])
        }

        var reply: [String: Any] = ["access": access, "items": items]
        if page.hasMore, let last {
            reply["next"] = PhotoLibraryCore.encode(.init(offset: page.range.upperBound, anchorId: last.localIdentifier))
        }
        return reply
    }

    /// A preview from what is already on the device. iCloud is never asked: a page is 60 synchronous
    /// requests in a row, and on a slow or absent network each one would wait out its own download
    /// until the web's request timed out. Photos keeps small renditions of every photo locally, so the
    /// fast rendition is the fallback when a sharper one is not there.
    private static func thumbnail(_ asset: PHAsset) -> String? {
        let edge = CGFloat(PhotoLibraryCore.thumbnailEdge)
        let image = localImage(asset, size: CGSize(width: edge, height: edge), mode: .highQualityFormat)
            ?? localImage(asset, size: CGSize(width: edge, height: edge), mode: .fastFormat)
        return image?.jpegData(compressionQuality: 0.7)?.base64EncodedString()
    }

    private static func localImage(_ asset: PHAsset, size: CGSize, mode: PHImageRequestOptionsDeliveryMode) -> UIImage? {
        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.deliveryMode = mode
        options.resizeMode = .fast
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
}
