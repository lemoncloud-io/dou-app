import Foundation
import React

/// React Native face of the native file transfers. It holds nothing: every call goes to
/// `TransferSessionOwner.shared`, which outlives this module (a bridge reload, or a background
/// launch where React Native never starts), and events are relayed only while JS listens.
@objc(TransferManager)
final class TransferManager: RCTEventEmitter {
    private static let stateEvent = "TransferManagerStateChanged"

    @objc override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! { [Self.stateEvent] }

    override func startObserving() {
        TransferSessionOwner.shared.setListener(self) { [weak self] payload in
            self?.sendEvent(withName: Self.stateEvent, body: payload)
        }
    }

    override func stopObserving() {
        TransferSessionOwner.shared.removeListener(self)
    }

    override func invalidate() {
        TransferSessionOwner.shared.removeListener(self)
        super.invalidate()
    }

    @objc(start:resolve:reject:)
    func start(_ request: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        TransferSessionOwner.shared.start(request as? [String: Any] ?? [:]) { error in
            Self.settle(error, resolve: resolve, reject: reject)
        }
    }

    @objc(cancel:resolve:reject:)
    func cancel(_ transferId: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        TransferSessionOwner.shared.cancel(transferId as String) { error in
            Self.settle(error, resolve: resolve, reject: reject)
        }
    }

    @objc(list:reject:)
    func list(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        TransferSessionOwner.shared.list { resolve($0) }
    }

    @objc(ack:resolve:reject:)
    func ack(_ transferIds: NSArray, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        // A non-string element cannot name a transfer; skipping it beats crashing on the cast.
        let ids = transferIds.compactMap { $0 as? String }
        TransferSessionOwner.shared.ack(ids) { resolve(NSNumber(value: $0)) }
    }

    /// The rejection code is the transfer error code, so JS can pass it straight into the reply.
    private static func settle(_ error: TransferError?, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
        if let error {
            reject(error.code.rawValue, error.message, nil)
        } else {
            resolve(nil)
        }
    }
}
