import Foundation
import React

/// Relays pure-native (Swift) logs into the JS logging core (ADR-0047).
/// Native code calls `ChaticNativeLogger.log`; entries queue until JS
/// subscribes and calls `ready()`, then flow as `ChaticNativeLog` events —
/// cold-start logs survive instead of being dropped by an emitter with no
/// listeners. Every call also mirrors to NSLog so local debugging keeps its
/// Xcode console output.
@objc(ChaticNativeLogger)
class ChaticNativeLogger: RCTEventEmitter {

  private static let eventName = "ChaticNativeLog"
  private static let maxQueue = 200
  private static weak var shared: ChaticNativeLogger?
  private static var pending: [[String: Any]] = []
  private static var isReady = false
  private static let lock = NSLock()

  override init() {
    super.init()
    ChaticNativeLogger.shared = self
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    return [ChaticNativeLogger.eventName]
  }

  /// JS calls this once its listener is subscribed — flushes the cold-start queue.
  @objc func ready() {
    ChaticNativeLogger.lock.lock()
    ChaticNativeLogger.isReady = true
    let queued = ChaticNativeLogger.pending
    ChaticNativeLogger.pending = []
    ChaticNativeLogger.lock.unlock()
    queued.forEach { sendEvent(withName: ChaticNativeLogger.eventName, body: $0) }
  }

  /// Static entry point for native code.
  static func log(level: String = "info", tag: String, message: String, error: Error? = nil) {
    let errorText = error.map { String(describing: $0) }
    NSLog("[%@] [%@] %@ %@", level, tag, message, errorText ?? "")

    var entry: [String: Any] = [
      "level": level,
      "tag": tag,
      "message": message,
      "timestamp": Date().timeIntervalSince1970 * 1000,
    ]
    if let errorText = errorText {
      entry["error"] = errorText
    }

    lock.lock()
    let emitter = isReady ? shared : nil
    if emitter == nil {
      if pending.count >= maxQueue {
        pending.removeFirst()
      }
      pending.append(entry)
    }
    lock.unlock()
    emitter?.sendEvent(withName: eventName, body: entry)
  }
}
