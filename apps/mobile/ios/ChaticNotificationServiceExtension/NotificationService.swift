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
            // Retrieve custom fields from APNs payload
            let titleLocKey = userInfo["title_loc_key"] as? String ?? userInfo["titleLocKey"] as? String ?? ""
            let titleLocArgs = userInfo["title_loc_args"] as? String ?? userInfo["titleLocArgs"] as? String ?? ""
            let bodyLocKey = userInfo["loc_key"] as? String ?? userInfo["bodyLocKey"] as? String ?? ""
            let bodyLocArgs = userInfo["loc_args"] as? String ?? userInfo["bodyLocArgs"] as? String ?? ""
            let channelId = userInfo["channel_id"] as? String ?? userInfo["channelId"] as? String ?? "dou_chat"
            
            // Determine current language locale
            let lang = resolveLanguage()
            let i18nDict = loadI18nJson(lang: lang)
            
            // Translate title & body
            let finalTitle = translate(dict: i18nDict, key: titleLocKey, argsJsonStr: titleLocArgs)
            let finalBody = translate(dict: i18nDict, key: bodyLocKey, argsJsonStr: bodyLocArgs)
            
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
    
    private func translate(dict: [String: Any]?, key: String, argsJsonStr: String) -> String {
        guard !key.isEmpty else { return "" }
        guard let dict = dict else { return key }
        guard let template = resolveKey(dict: dict, path: key) else { return key }
        
        let args = parseArgs(jsonStr: argsJsonStr)
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
    
    private func parseArgs(jsonStr: String) -> [String] {
        guard let data = jsonStr.data(using: .utf8) else { return [] }
        do {
            if let array = try JSONSerialization.jsonObject(with: data, options: []) as? [String] {
                return array
            }
        } catch {}
        return []
    }
}
