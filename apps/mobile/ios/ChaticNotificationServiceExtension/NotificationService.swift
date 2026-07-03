import UserNotifications
import Foundation

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

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
            let finalBody = translate(dict: i18nDict, key: bodyLocKey, args: bodyLocArgs)
            
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
            
            contentHandler(bestAttemptContent)
        }
    }
    
    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }
    
    // MARK: - Localization Helpers
    
    private func resolveLanguage() -> String {
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
    
    private func translate(dict: [String: Any]?, key: String, args: [String]) -> String {
        guard !key.isEmpty else { return "" }
        guard let dict = dict else { return key }
        guard let template = resolveKey(dict: dict, path: key) else { return key }

        return formatTemplate(template: template, args: args)
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
    
    private func formatTemplate(template: String, args: [String]) -> String {
        var result = template
        for (index, arg) in args.enumerated() {
            result = result.replacingOccurrences(of: "{\(index)}", with: arg)
        }
        return result
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
