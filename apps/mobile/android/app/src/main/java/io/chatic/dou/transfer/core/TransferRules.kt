package io.chatic.dou.transfer.core

import java.net.URI

/** Stateless rules of the transfer core: header filtering, response parsing and log hygiene. */
object TransferRules {

    const val MAX_ERROR_MESSAGE_BYTES = 200
    const val DEFAULT_CONTENT_TYPE = "application/octet-stream"

    /**
     * Headers the platform writes itself. The HTTP stack sets the length from the fixed-length
     * streaming mode and the host from the URL; sending the caller's copy as well would either be
     * refused or duplicate the header.
     */
    private val PLATFORM_OWNED_HEADERS = setOf("content-length", "host")

    private val PROVIDER_CODE = Regex("<Code>([^<]+)</Code>")
    private val URL_PATTERN = Regex("[A-Za-z][A-Za-z0-9+.-]*://\\S+")

    /** Removes the platform-owned headers case-insensitively and keeps every other one as given. */
    fun filterHeaders(headers: Map<String, String>): Map<String, String> =
        headers.filterKeys { it.lowercase() !in PLATFORM_OWNED_HEADERS }

    /**
     * The headers actually sent: [filterHeaders], plus a `Content-Type` when the caller gave none.
     *
     * The explicit value matters on Android: `HttpURLConnection` fills a missing content type on a
     * request with a body with `application/x-www-form-urlencoded`, which would be stored as the
     * object's type. A caller-provided `Content-Type` (usually a signed one) always wins.
     */
    fun requestHeaders(headers: Map<String, String>, contentType: String?): Map<String, String> {
        val filtered = filterHeaders(headers)
        if (filtered.keys.any { it.equals("content-type", ignoreCase = true) }) return filtered
        val type = contentType?.takeIf { it.isNotBlank() } ?: DEFAULT_CONTENT_TYPE
        return LinkedHashMap(filtered).apply { put("Content-Type", type) }
    }

    /**
     * The headers a download sends: [filterHeaders], with `Accept-Encoding: identity` in place of
     * any the caller gave. Both HTTP stacks ask for gzip by default and inflate the reply on their
     * own, so the bytes kept and the length reported could differ from the stored object's. The
     * signature covers the host only, so replacing this header does not break it.
     */
    fun downloadHeaders(headers: Map<String, String>): Map<String, String> =
        LinkedHashMap(filterHeaders(headers).filterKeys { !it.equals("accept-encoding", ignoreCase = true) })
            .apply { put("Accept-Encoding", "identity") }

    /**
     * An absolute http(s) URL with a host. Checked at `start` so a malformed instruction is refused
     * straight away instead of being accepted and failing later — the iOS shell refuses it at the
     * same point, and a caller should get the same answer on both.
     */
    fun isTransferUrl(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        return try {
            val uri = java.net.URI(url)
            val scheme = uri.scheme?.lowercase()
            (scheme == "http" || scheme == "https") && !uri.host.isNullOrEmpty()
        } catch (_: java.net.URISyntaxException) {
            false
        }
    }

    /** The storage error code of an S3-style XML error body, or null when there is none. */
    fun parseProviderCode(body: String?): String? {
        if (body.isNullOrEmpty()) return null
        return PROVIDER_CODE.find(body)?.groupValues?.get(1)?.trim()?.takeIf { it.isNotEmpty() }
    }

    /**
     * A diagnostic string that is safe to hand over the bridge: every URL replaced with `[url]`
     * (an exception message can quote the signed URL), then cut to [MAX_ERROR_MESSAGE_BYTES] UTF-8
     * bytes on a character boundary.
     */
    fun sanitizeMessage(message: String?): String? {
        if (message == null) return null
        return truncateUtf8(URL_PATTERN.replace(message, "[url]"), MAX_ERROR_MESSAGE_BYTES)
    }

    /** Cuts [text] to at most [maxBytes] UTF-8 bytes without splitting a code point. */
    fun truncateUtf8(text: String, maxBytes: Int): String {
        var bytes = 0
        var index = 0
        while (index < text.length) {
            val codePoint = text.codePointAt(index)
            val size = utf8Size(codePoint)
            if (bytes + size > maxBytes) return text.substring(0, index)
            bytes += size
            index += Character.charCount(codePoint)
        }
        return text
    }

    private fun utf8Size(codePoint: Int): Int = when {
        codePoint < 0x80 -> 1
        codePoint < 0x800 -> 2
        codePoint < 0x10000 -> 3
        else -> 4
    }

    /** The host of [url] for logs — the full URL carries a signed credential in its query string. */
    fun safeHost(url: String?): String =
        try {
            URI(url ?: "").host ?: "unparsable"
        } catch (_: Exception) {
            "unparsable"
        }
}
