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
  @objc func start() {
    guard #available(iOS 27.1, *) else { return }
    guard let window = (UIApplication.shared.delegate as? AppDelegate)?.window else { return }

    if let current = observer as? DivisionObserverView, current.superview === window {
      send(current.currentDivision())
      return
    }
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
