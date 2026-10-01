import UIKit

/// Keeps the launch screen up until the web reports that its first screen is painted.
///
/// iOS removes its own launch screen as soon as the app draws its first frame, which is long before
/// the WebView has anything to show. So right after React Native starts, AppDelegate lays the same
/// `LaunchScreen` storyboard over the window as an ordinary view, and it stays until the web calls
/// `BootSplash.hide` — or until the safety cap, so a crashed or hung JS runtime cannot leave the user
/// on the logo. The logo is therefore drawn by native only; nothing on the RN or web side repeats it.
///
/// The OS draws the real launch screen in the OS appearance, before any app code runs. The overlay
/// instead uses the in-app theme recorded by `setStartupTheme` on the previous run, so a user whose
/// app theme differs from the OS sees the OS-themed launch screen for an instant and then the
/// app-themed splash for the rest of the boot. The override is set on the overlay view alone: on the
/// window it would also change the colour scheme React Native reports, and the 'system' theme is
/// resolved from exactly that value.
///
/// Main thread only — it owns UIKit views.
final class BootSplashOverlay {
  static let shared = BootSplashOverlay()

  private static let startupThemeKey = "bootSplash.startupTheme"
  private static let startupThemes: Set<String> = ["light", "dark", "system"]
  private static let safetyCap: TimeInterval = 5
  private static let fadeDuration: TimeInterval = 0.2

  private var overlay: UIView?

  /// Lays the launch screen over `window`. Call after React Native has installed its root view
  /// controller, so the overlay sits above it.
  func show(in window: UIWindow) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard overlay == nil,
      let view = UIStoryboard(name: "LaunchScreen", bundle: nil)
        .instantiateInitialViewController()?.view
    else { return }

    let theme = UserDefaults.standard.string(forKey: Self.startupThemeKey)
    view.overrideUserInterfaceStyle = Self.interfaceStyle(for: theme)
    view.frame = window.bounds
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    window.addSubview(view)
    overlay = view
    Self.applyStatusBarStyle(for: theme)

    DispatchQueue.main.asyncAfter(deadline: .now() + Self.safetyCap) { [weak self, weak view] in
      // Only the overlay this timer was armed for; a later one gets its own timer.
      guard let self, let view, self.overlay === view else { return }
      self.hide(fade: true)
    }
  }

  /// Removes the overlay. Returns false when it was already gone, so a repeat call is a no-op.
  @discardableResult
  func hide(fade: Bool) -> Bool {
    dispatchPrecondition(condition: .onQueue(.main))
    guard let view = overlay else { return false }
    overlay = nil

    guard fade else {
      view.removeFromSuperview()
      return true
    }
    UIView.animate(
      withDuration: Self.fadeDuration,
      animations: { view.alpha = 0 },
      completion: { _ in view.removeFromSuperview() }
    )
    return true
  }

  /// Records the in-app theme for the next launch's overlay. Anything other than
  /// 'light' | 'dark' | 'system' is ignored.
  static func setStartupTheme(_ theme: String) -> Bool {
    guard startupThemes.contains(theme) else { return false }
    UserDefaults.standard.set(theme, forKey: startupThemeKey)
    return true
  }

  private static func interfaceStyle(for theme: String?) -> UIUserInterfaceStyle {
    switch theme {
    case "dark": return .dark
    case "light": return .light
    default: return .unspecified
    }
  }

  /// With `UIViewControllerBasedStatusBarAppearance` off, the default status bar style follows the
  /// OS appearance, not the overlay's override, so an OS-light / app-dark user would get dark icons
  /// on the dark splash until the RN `SystemBars` component sets the style. Setting it here closes
  /// that gap; SystemBars sets the same value once it mounts. 'system' keeps the OS default, which
  /// already matches.
  private static func applyStatusBarStyle(for theme: String?) {
    let style: UIStatusBarStyle
    switch theme {
    case "dark": style = .lightContent
    case "light": style = .darkContent
    default: return
    }
    // Deprecated, but it is the setter app-wide status bar styling uses (React Native's StatusBar
    // module included) when view-controller-based appearance is off.
    UIApplication.shared.setStatusBarStyle(style, animated: false)
  }
}
