import Foundation

/// String rules shared by both platforms: which headers are sent, how the storage error code is
/// read, and how a diagnostic message is made safe to hand to the web.
enum TransferText {
    /// Headers the HTTP stack owns. `URLSession` computes the length from the file itself and the
    /// host from the URL; a caller-supplied value would conflict with it. The body length equals the
    /// declared one, so the signature still matches without them.
    private static let platformOwnedHeaders: Set<String> = ["content-length", "host"]

    static let maxErrorMessageBytes = 200

    private static let providerCodePattern = try! NSRegularExpression(pattern: "<Code>([^<]+)</Code>")
    private static let urlPattern = try! NSRegularExpression(pattern: "[A-Za-z][A-Za-z0-9+.-]*://\\S+")

    /// Whether `url` can be a transfer target: absolute, `http` or `https`, with a host.
    static func isTransferURL(_ url: String) -> Bool {
        guard let parsed = URL(string: url), let scheme = parsed.scheme?.lowercased(),
              scheme == "http" || scheme == "https", let host = parsed.host, !host.isEmpty
        else { return false }
        return true
    }

    /// The local file a `file.uri` names — a `file://` URI or an absolute path — or `nil` for
    /// anything else, since a background session uploads only from a local file.
    static func localFileURL(_ uri: String) -> URL? {
        if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
        if let parsed = URL(string: uri) { return parsed.isFileURL ? parsed : nil }
        // A `file://` URI with characters `URL(string:)` refuses, such as an unencoded space.
        guard uri.hasPrefix("file://") else { return nil }
        let path = String(uri.dropFirst(7))
        return URL(fileURLWithPath: path.removingPercentEncoding ?? path)
    }

    /// Every header except the platform-owned ones (matched case-insensitively), values untouched.
    static func filterHeaders(_ headers: [String: String]) -> [String: String] {
        headers.filter { !platformOwnedHeaders.contains($0.key.lowercased()) }
    }

    /// The headers actually sent: the caller's, minus the platform-owned ones, plus a
    /// `Content-Type` when the caller gave none. Without one the storage would record whatever
    /// the HTTP stack guesses, so the declared file type (or a neutral binary type) is used.
    static func requestHeaders(_ headers: [String: String], contentType: String?) -> [String: String] {
        var result = filterHeaders(headers)
        if !result.keys.contains(where: { $0.lowercased() == "content-type" }) {
            let declared = contentType?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            result["Content-Type"] = declared.isEmpty ? "application/octet-stream" : declared
        }
        return result
    }

    /// The S3 `<Code>` of an error body, or `nil` when the body is not such a document.
    static func providerCode(from body: Data?) -> String? {
        guard let body, !body.isEmpty else { return nil }
        let text = String(decoding: body, as: UTF8.self)
        let range = NSRange(text.startIndex..., in: text)
        guard let match = providerCodePattern.firstMatch(in: text, range: range),
              let codeRange = Range(match.range(at: 1), in: text)
        else { return nil }
        return String(text[codeRange])
    }

    /// Removes anything URL-shaped (a signed URL carries a credential in its query string), then
    /// cuts to `maxErrorMessageBytes` UTF-8 bytes on a character boundary so the result is always
    /// valid text.
    static func sanitize(_ message: String) -> String {
        let range = NSRange(message.startIndex..., in: message)
        let redacted = urlPattern.stringByReplacingMatches(in: message, range: range, withTemplate: "[url]")
        if redacted.utf8.count <= maxErrorMessageBytes { return redacted }
        var result = ""
        var bytes = 0
        for character in redacted {
            let size = String(character).utf8.count
            if bytes + size > maxErrorMessageBytes { break }
            result.append(character)
            bytes += size
        }
        return result
    }
}
