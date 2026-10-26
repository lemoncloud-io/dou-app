import UIKit
import React

/// Tells JS where the device fold is: the window's active `.division` reserved region, which
/// iOS 27.1 reports on a foldable held half-open (iPhone Duo as a book) and nowhere else.
///
/// UIKit posts no notification when the region changes, so a window-sized view that never takes a
/// touch asks again on every layout pass and the module sends only when the answer differs. The
/// rect is the region's frame in window points, margins included; JS moves it into the WebView's
/// coordinates. Before iOS 27.1 `start()` does nothing, which JS reads as no fold.
@objc(DisplayRegion)
class DisplayRegionModule: RCTEventEmitter {

  private static let divisionChange = "DisplayRegionDivisionChange"

  private var observer: UIView?
  private var keyWindowObserver: NSObjectProtocol?
  private var hasListeners = false

  @objc override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // `start()` touches the window, so it runs on the main queue.
  override var methodQueue: DispatchQueue! {
    return .main
  }

  override func supportedEvents() -> [String]! {
    return [DisplayRegionModule.divisionChange]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  /// JS calls this once subscribed: puts the observer on the app window and sends the current fold.
  ///
  /// It follows the window from then on. When the system reconnects a scene, `SceneDelegate` moves
  /// the running root into a new window without remounting anything in JS, so `start()` is not
  /// called again; left on the old window, which is no longer laid out, the observer would never
  /// report the fold again and a stale value would keep dialogs off-centre on a flat display.
  /// The new window becomes key as the root moves over, and that is the cue to move with it.
  @objc func start() {
    guard #available(iOS 27.1, *) else { return }
    if keyWindowObserver == nil {
      keyWindowObserver = NotificationCenter.default.addObserver(
        forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.attach() }
    }
    let attached = observer
    attach()
    // Already on the window, so `attach()` sent nothing; a new subscriber still needs the value.
    if observer === attached, let current = observer as? DivisionObserverView {
      send(current.currentDivision())
    }
  }

  /// Puts the observer on the app window unless it is already there, and sends the fold it sees.
  /// A window that merely becomes key again changes nothing and sends nothing.
  @available(iOS 27.1, *)
  private func attach() {
    guard let window = (UIApplication.shared.delegate as? AppDelegate)?.window else { return }
    if observer?.superview === window { return }

    observer?.removeFromSuperview()
    let view = DivisionObserverView(frame: window.bounds)
    view.onChange = { [weak self] division in self?.send(division) }
    window.addSubview(view)
    observer = view
    send(view.currentDivision())
  }

  private func send(_ division: CGRect?) {
    guard hasListeners else { return }
    ChaticNativeLogger.log(level: "debug", tag: "DISPLAY_REGION", message: "division \(division.map { "\($0)" } ?? "none")")
    let body: Any = division.map {
      ["x": $0.origin.x, "y": $0.origin.y, "width": $0.size.width, "height": $0.size.height]
    } ?? NSNull()
    sendEvent(withName: DisplayRegionModule.divisionChange, body: ["division": body])
  }

  override func invalidate() {
    if let keyWindowObserver { NotificationCenter.default.removeObserver(keyWindowObserver) }
    keyWindowObserver = nil
    let view = observer
    observer = nil
    DispatchQueue.main.async { view?.removeFromSuperview() }
    super.invalidate()
  }
}

/// Transparent, untouchable and hidden from accessibility; it exists only to get `layoutSubviews`.
@available(iOS 27.1, *)
private final class DivisionObserverView: UIView {

  var onChange: ((CGRect?) -> Void)?
  private var lastSent: CGRect??

  override init(frame: CGRect) {
    super.init(frame: frame)
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    isUserInteractionEnabled = false
    backgroundColor = .clear
    accessibilityElementsHidden = true
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not used")
  }

  /// The first active division, in this view's coordinates — the window's, since it fills it.
  private var activeDivision: CGRect? {
    reservedRegions(kind: .division).first(where: { $0.isActive })?.frame
  }

  func currentDivision() -> CGRect? {
    let division = activeDivision
    lastSent = .some(division)
    return division
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let division = activeDivision
    if let last = lastSent, last == division { return }
    lastSent = .some(division)
    onChange?(division)
  }
}
