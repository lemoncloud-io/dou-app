import Foundation
import React

/// JS-facing side of `BootSplashOverlay`: the web calls `hide` once its first screen is painted,
/// and `setStartupTheme` whenever the in-app theme changes so the next launch's splash matches it.
@objc(BootSplash)
class BootSplashModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// The overlay is UIKit state, so every method runs on the main queue.
  @objc var methodQueue: DispatchQueue {
    return DispatchQueue.main
  }

  /// Resolves true if this call removed the splash, false if it was already gone.
  @objc func hide(
    _ fade: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(BootSplashOverlay.shared.hide(fade: fade))
  }

  /// Resolves false, without storing anything, for a value other than 'light' | 'dark' | 'system'.
  @objc func setStartupTheme(
    _ theme: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(BootSplashOverlay.setStartupTheme(theme))
  }
}
