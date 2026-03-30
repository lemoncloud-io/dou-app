import Foundation
import React

/// Native module that exposes the buffered Universal Link URL to JavaScript.
/// Workaround for React Native race condition where `Linking.getInitialURL()`
/// returns null on cold start because `application(_:continue:restorationHandler:)`
/// is called after JS has already executed.
@objc(InitialUrlModule)
class InitialUrlModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  /// Returns the Universal Link URL that was buffered in AppDelegate during cold start.
  /// After retrieval, the stored URL is cleared to prevent stale reads.
  @objc
  func getInitialUniversalLink(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = AppDelegate.initialUniversalLink
    AppDelegate.initialUniversalLink = nil
    resolve(url)
  }
}
