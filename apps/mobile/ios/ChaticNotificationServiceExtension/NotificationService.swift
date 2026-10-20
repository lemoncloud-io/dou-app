import UserNotifications
import Foundation
import ImageIO

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?
    /// Guards `contentHandler`, `thumbnailTask` and the content's attachments: the thumbnail fetch and
    /// `serviceExtensionTimeWillExpire` run on different threads and can race to deliver, and the
    /// handler must run exactly once.
    private let deliveryLock = NSLock()
    private var thumbnailTask: URLSessionDownloadTask?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)
        
        if let bestAttemptContent = bestAttemptContent {
            let userInfo = request.content.userInfo
            
            // Retrieve custom fields from APNs payload
            let titleLocKey = userInfo["title_loc_key"] as? String ?? userInfo["titleLocKey"] as? String ?? ""
            let bodyLocKey = userInfo["loc_key"] as? String ?? userInfo["bodyLocKey"] as? String ?? ""
            // loc-args arrive as a native JSON array over APNs from the real backend
            // (e.g. ["Raine"]) but as a JSON-encoded string from our FCM-shaped test
            // tooling (e.g. "[\"Raine\"]"). Read the raw value and let normalizeArgs()
            // accept both shapes — forcing `as? String` here dropped the array form and
            // left "{0}" unsubstituted on the banner.
            let titleLocArgs = normalizeArgs(userInfo["title_loc_args"] ?? userInfo["titleLocArgs"])
            let bodyLocArgs = normalizeArgs(userInfo["loc_args"] ?? userInfo["bodyLocArgs"])
            let channelId = userInfo["channel_id"] as? String ?? userInfo["channelId"] as? String ?? "dou_chat"
            
            // Determine current language locale
            let lang = resolveLanguage()
            let i18nDict = loadI18nJson(lang: lang)
            
            // Translate title & body
            let finalTitle = translate(dict: i18nDict, key: titleLocKey, args: titleLocArgs)
            let finalBody = translate(dict: i18nDict, key: bodyLocKey, args: bodyLocArgs, fallbackKey: NotificationService.bodyFallbackKey)
            
            if !finalTitle.isEmpty {
                bestAttemptContent.title = finalTitle
            }
            if !finalBody.isEmpty {
                bestAttemptContent.body = finalBody
            }
            
            // Mute sound for muted chat rooms or marketing pushes
            if channelId == "dou_chat_muted" || channelId == "dou_marketing" {
                bestAttemptContent.sound = nil
            }

            // Bump the app-icon badge for background chat pushes. The app/socket is suspended here,
            // so this extension is the only place a backgrounded message can move the count: we read
            // the base the app captured on backgrounding and increment it, and the app re-aggregates
            // the true total on the next foreground.
            applyBadgeIncrementIfNeeded(channelId: channelId, userInfo: userInfo, content: bestAttemptContent)

            // The copy is final before the image is even asked for, so whichever way delivery happens
            // — fetched, failed, or cut off by the system's deadline — the banner reads translated.
            // While the app is active the system banner is suppressed and the web draws its own, with
            // the same image — fetching here would cost a download nobody sees.
            guard !isAppActive(), let thumbnailURL = senderThumbnailURL(userInfo) else {
                deliver()
                return
            }
            attachSenderThumbnail(from: thumbnailURL)
        }
    }
    
    override func serviceExtensionTimeWillExpire() {
        deliveryLock.lock()
        let task = thumbnailTask
        deliveryLock.unlock()
        task?.cancel()
        deliver()
    }

    /// Hands the content to the system once, with `attachment` if one is given and nothing has been
    /// delivered yet; later calls are no-ops. Returns whether this call delivered.
    @discardableResult
    private func deliver(attachment: UNNotificationAttachment? = nil) -> Bool {
        deliveryLock.lock()
        let handler = contentHandler
        contentHandler = nil
        if handler != nil, let attachment = attachment {
            bestAttemptContent?.attachments = [attachment]
        }
        deliveryLock.unlock()
        guard let handler = handler, let content = bestAttemptContent else { return false }
        handler(content)
        return true
    }

    private func isAppActive() -> Bool {
        UserDefaults(suiteName: NotificationService.appGroupId)?.bool(forKey: NotificationService.appActiveKey) ?? false
    }

    // MARK: - Sender profile image

    /// The whole budget for fetching the sender's image; past it the banner goes without one.
    private static let thumbnailTimeout: TimeInterval = 3
    /// Size cap on the fetched image; a bigger one is dropped.
    private static let thumbnailMaxBytes = 1_048_576
    /// Pixel edge the image is decoded down to. Decoding at full size could pass the extension's
    /// small memory limit on its own, so ImageIO downsamples straight from the file.
    private static let thumbnailEdge = 256
    /// Largest source image, in pixels, that is decoded at all. A small file can declare a huge
    /// image, and not every format's thumbnail path avoids a full decode; past this it is skipped.
    private static let thumbnailMaxSourcePixels = 16_000_000

    /// The payload's `thumbnail`, if it is an `https://` address — anything else (absent, `http://`,
    /// a `data:` or `file:` URI) is ignored. The host itself is not restricted.
    private func senderThumbnailURL(_ userInfo: [AnyHashable: Any]) -> URL? {
        guard let raw = (flattenedPayload(userInfo)["thumbnail"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              raw.lowercased().hasPrefix("https://"),
              let url = URL(string: raw),
              url.host?.isEmpty == false else { return nil }
        return url
    }

    /// Fetches the sender's image, crops it round and attaches it, then delivers. Every failure
    /// delivers the banner without the image — the image must never cost the notification. The address
    /// is never logged: a profile image URL can carry user identifiers.
    private func attachSenderThumbnail(from url: URL) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = NotificationService.thumbnailTimeout
        config.timeoutIntervalForResource = NotificationService.thumbnailTimeout
        let session = URLSession(configuration: config)

        // A download task streams to disk, so even an oversized response never sits in the
        // extension's memory; the size is checked on the file afterwards.
        let task = session.downloadTask(with: url) { [weak self] location, response, error in
            defer { session.finishTasksAndInvalidate() }
            guard let self = self else { return }
            guard error == nil,
                  let location = location,
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  let size = (try? FileManager.default.attributesOfItem(atPath: location.path))?[.size] as? Int,
                  size <= NotificationService.thumbnailMaxBytes,
                  let roundFile = self.writeRoundThumbnail(from: location) else {
                self.deliver()
                return
            }
            // The system moves an attachment's file away only when it is created; on any other
            // outcome the PNG is ours to remove.
            guard let attachment = try? UNNotificationAttachment(
                identifier: "sender-thumbnail",
                url: roundFile,
                options: [UNNotificationAttachmentOptionsTypeHintKey: "public.png"]
            ) else {
                try? FileManager.default.removeItem(at: roundFile)
                self.deliver()
                return
            }
            self.deliver(attachment: attachment)
        }
        deliveryLock.lock()
        thumbnailTask = task
        deliveryLock.unlock()
        task.resume()
    }

    /// Downsamples the image at `source` to `thumbnailEdge`, crops a centred circle out of it and
    /// writes a PNG into the temporary directory, returning its URL — or nil when it is not an image.
    private func writeRoundThumbnail(from source: URL) -> URL? {
        guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0,
              width * height <= NotificationService.thumbnailMaxSourcePixels else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: NotificationService.thumbnailEdge,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
            return nil
        }

        let edge = min(image.width, image.height)
        guard edge > 0,
              let context = CGContext(
                  data: nil,
                  width: edge,
                  height: edge,
                  bitsPerComponent: 8,
                  bytesPerRow: 0,
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else { return nil }
        let square = CGRect(x: 0, y: 0, width: edge, height: edge)
        context.addEllipse(in: square)
        context.clip()
        context.draw(image, in: CGRect(
            x: -CGFloat(image.width - edge) / 2,
            y: -CGFloat(image.height - edge) / 2,
            width: CGFloat(image.width),
            height: CGFloat(image.height)
        ))
        guard let round = context.makeImage() else { return nil }

        let target = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("png")
        guard let destination = CGImageDestinationCreateWithURL(target as CFURL, "public.png" as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(destination, round, nil)
        return CGImageDestinationFinalize(destination) ? target : nil
    }

    // MARK: - Badge counter (shared with the main app via App Group)

    /// App Group id shared with the main app; must match the entitlement on both targets.
    private static let appGroupId = "group.io.chatic.dou"
    private static let badgeCountKey = "badge_count"
    private static let appActiveKey = "app_active"
    private static let pushMarksKey = "push_marks"
    /// The language chosen in the app's Settings (`system`, `ko` or `en`), written by the app's
    /// `SharedLanguage` module. Must match `SharedLanguageModule.m`.
    private static let languagePreferenceKey = "language_preference"
    /// Backstop against unbounded growth if the app build predates the drain bridge and never reads it.
    private static let maxPushMarks = 100

    /// Increments the shared badge counter for a background chat push and writes it onto the banner.
    /// No-ops for non-chat channels (to match the web's chat-only unread total) and while the app is
    /// active (the web owns the badge over the socket then, so incrementing would double-count).
    /// Cross-cloud push mark (ADR-0056): same gate — record the raw hint alongside the badge bump so
    /// the web can resolve+mark it on the next launch/foreground.
    private func applyBadgeIncrementIfNeeded(channelId: String, userInfo: [AnyHashable: Any], content: UNMutableNotificationContent) {
        let isChatChannel = channelId == "dou_chat" || channelId == "dou_chat_muted"
        guard isChatChannel else { return }

        guard let defaults = UserDefaults(suiteName: NotificationService.appGroupId) else { return }
        if defaults.bool(forKey: NotificationService.appActiveKey) { return }

        let next = defaults.integer(forKey: NotificationService.badgeCountKey) + 1
        defaults.set(next, forKey: NotificationService.badgeCountKey)
        content.badge = NSNumber(value: next)

        appendPushMarkIfNeeded(userInfo: userInfo, defaults: defaults)
    }

    // MARK: - Cross-cloud push mark (ADR-0056, shared with the main app via App Group)

    /// Raw push-mark hint — parsed here, never interpreted. The relay sentinel (`cid == "#"`) and an
    /// empty `cid`'s cross-partition cache lookup both happen once, on the web
    /// (see resolvePushCloudId.ts) — this extension only carries the fields across.
    private struct PushCloudHint {
        let cid: String?
        let uid: String?
        let channelId: String?
        let sid: String?
        let channelName: String?
    }

    /// The APNs payload's fields as one map: top-level fields first, then the nested `data`/`payload`
    /// field — a dictionary OR a JSON-encoded string, sender-dependent (the same dual-shape ambiguity
    /// `normalizeArgs` already handles for loc-args) — overriding them.
    private func flattenedPayload(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
        var source: [String: Any] = [:]
        for (key, value) in userInfo {
            if let key = key as? String {
                source[key] = value
            }
        }

        let nested = userInfo["data"] ?? userInfo["payload"]
        if let dict = nested as? [String: Any] {
            source.merge(dict) { _, new in new }
        } else if let str = nested as? String, !str.isEmpty,
                  let data = str.data(using: .utf8),
                  let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            source.merge(parsed) { _, new in new }
        }
        return source
    }

    /// Reads the mark hint fields off the flattened APNs payload.
    private func parsePushCloudHint(_ userInfo: [AnyHashable: Any]) -> PushCloudHint {
        let source = flattenedPayload(userInfo)

        func stringField(_ key: String) -> String? {
            guard let value = source[key] as? String, !value.isEmpty else { return nil }
            return value
        }

        return PushCloudHint(
            cid: stringField("cid"),
            uid: stringField("uid"),
            channelId: stringField("channelId"),
            sid: stringField("sid"),
            channelName: stringField("channelName")
        )
    }

    /// Appends one raw hint record to the shared App Group store, capped at `maxPushMarks`. A no-op
    /// when nothing in the hint could ever identify a cloud (no `cid`/`uid`/`channelId`).
    private func appendPushMarkIfNeeded(userInfo: [AnyHashable: Any], defaults: UserDefaults) {
        let hint = parsePushCloudHint(userInfo)
        guard hint.cid != nil || hint.uid != nil || hint.channelId != nil else { return }

        var record: [String: String] = [:]
        record["cid"] = hint.cid
        record["uid"] = hint.uid
        record["channelId"] = hint.channelId
        record["sid"] = hint.sid
        record["channelName"] = hint.channelName

        var marks = defaults.array(forKey: NotificationService.pushMarksKey) as? [[String: String]] ?? []
        marks.append(record)
        if marks.count > NotificationService.maxPushMarks {
            marks.removeFirst(marks.count - NotificationService.maxPushMarks)
        }
        defaults.set(marks, forKey: NotificationService.pushMarksKey)
    }

    // MARK: - Localization Helpers

    /// Generic body for a push whose template came without the args it names. Never sent by the server.
    private static let bodyFallbackKey = "push_chat_fallback_body"

    /// A language pinned in the app's Settings wins. `system`, no value (the app has not launched
    /// since updating) or an unreadable store all fall back to the device language, as before.
    private func resolveLanguage() -> String {
        if let pinned = UserDefaults(suiteName: NotificationService.appGroupId)?
            .string(forKey: NotificationService.languagePreferenceKey),
            pinned == "ko" || pinned == "en" {
            return pinned
        }
        let preferredLanguage = Locale.preferredLanguages.first ?? "en"
        let components = preferredLanguage.components(separatedBy: "-")
        let langCode = components.first ?? "en"
        return langCode == "ko" ? "ko" : "en"
    }
    
    private func loadI18nJson(lang: String) -> [String: Any]? {
        // Look up translation files in assets/locales inside the Extension bundle resources
        if let path = Bundle.main.path(forResource: lang, ofType: "json", inDirectory: "assets/locales") {
            return parseJSONFile(path: path)
        }
        
        // Fallback search directly in bundle
        if let path = Bundle.main.path(forResource: lang, ofType: "json") {
            return parseJSONFile(path: path)
        }
        
        // Final fallback to english
        if lang != "en" {
            if let path = Bundle.main.path(forResource: "en", ofType: "json", inDirectory: "assets/locales") {
                return parseJSONFile(path: path)
            }
        }
        
        return nil
    }
    
    private func parseJSONFile(path: String) -> [String: Any]? {
        do {
            let data = try Data(contentsOf: URL(fileURLWithPath: path), options: .mappedIfSafe)
            let jsonResult = try JSONSerialization.jsonObject(with: data, options: .mutableLeaves)
            return jsonResult as? [String: Any]
         } catch {
             return nil
         }
    }
    
    /// `fallbackKey` names the copy to show when the template needs more args than the payload
    /// sent; without one the unfilled placeholders are dropped instead (see `formatTemplate`).
    private func translate(dict: [String: Any]?, key: String, args: [String], fallbackKey: String? = nil) -> String {
        guard !key.isEmpty else { return "" }
        // A key this build does not know stays on the banner as the key itself. That is the visible
        // sign a payload outran the installed app, which the server's rollout order is there to
        // prevent — covering it up here would hide the rollout mistake as well.
        guard let dict = dict else { return key }
        guard let template = resolveKey(dict: dict, path: key) else { return key }

        let fallback = fallbackKey.flatMap { resolveKey(dict: dict, path: $0) }
        return formatTemplate(template: template, args: args, fallback: fallback)
    }
    
    private func resolveKey(dict: [String: Any], path: String) -> String? {
        let keys = path.components(separatedBy: ".")
        var current: Any = dict
        for key in keys {
            if let nestedDict = current as? [String: Any] {
                guard let next = nestedDict[key] else { return nil }
                current = next
            } else {
                return nil
            }
        }
        return current as? String
    }
    
    /// A positional placeholder in a push template; the digits are the index of the arg it takes.
    private static let placeholderPattern = try! NSRegularExpression(pattern: "\\{(\\d+)\\}")

    /// Fills the template's `{n}` placeholders from `args`, in order.
    ///
    /// When the template names a placeholder `args` does not reach — a chat push for a message with
    /// no text sends no args for its `{0}` body — the result is not shown as-is: it is `fallback`
    /// when there is one, otherwise the template with those placeholders removed and trimmed. So a
    /// body falls back to generic copy while a title just loses the part it could not fill.
    ///
    /// The hole is judged on the template, not on the substituted result, so an arg that itself
    /// contains `{0}` (a message quoting code) is still shown verbatim. The Android service and
    /// the RN shell apply the same rule.
    private func formatTemplate(template: String, args: [String], fallback: String?) -> String {
        let pattern = NotificationService.placeholderPattern
        let whole = NSRange(template.startIndex..., in: template)
        // Walked back to front so removing a hole does not shift the ranges still to visit.
        let holes = pattern.matches(in: template, range: whole).filter { match in
            guard let range = Range(match.range(at: 1), in: template), let index = Int(template[range]) else {
                return true // an index too long for Int is certainly past the args too
            }
            return index >= args.count
        }

        if !holes.isEmpty, let fallback = fallback {
            return fallback
        }

        var result = template
        for hole in holes.reversed() {
            if let range = Range(hole.range, in: result) {
                result.removeSubrange(range)
            }
        }
        for (index, arg) in args.enumerated() {
            result = result.replacingOccurrences(of: "{\(index)}", with: arg)
        }
        return holes.isEmpty ? result : result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    /// Normalizes APNs loc-args into positional strings.
    ///
    /// The backend delivers loc-args as a native JSON array over APNs
    /// (e.g. `["Raine"]`), while our FCM-shaped test tooling sends a
    /// JSON-encoded string (e.g. `"[\"Raine\"]"`). Both must resolve to the same
    /// `["Raine"]` so `{0}` placeholders get substituted regardless of how the
    /// sender encoded them; anything else yields no args (template shown as-is).
    private func normalizeArgs(_ raw: Any?) -> [String] {
        if let array = raw as? [Any] {
            return array.map { stringify($0) }
        }
        if let str = raw as? String, !str.isEmpty,
           let data = str.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data, options: []) as? [Any] {
            return parsed.map { stringify($0) }
        }
        return []
    }

    /// Coerces a loc-arg element to String so numeric args (e.g. an unread count
    /// sent as `4` rather than `"4"`) still substitute cleanly.
    private func stringify(_ value: Any) -> String {
        if let s = value as? String { return s }
        if let n = value as? NSNumber { return n.stringValue }
        return String(describing: value)
    }
}
