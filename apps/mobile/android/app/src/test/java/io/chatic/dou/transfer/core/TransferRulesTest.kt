package io.chatic.dou.transfer.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TransferRulesTest {

    @Test
    fun isTransferUrl_acceptsAbsoluteHttpAndHttpsUrlsWithAHost() {
        assertTrue(TransferRules.isTransferUrl("https://bucket.example.com/key?X-Amz-Signature=abc"))
        assertTrue(TransferRules.isTransferUrl("HTTP://localhost:8080/s3/ok"))
    }

    @Test
    fun isTransferUrl_rejectsBlankRelativeOtherSchemesAndMalformedUrls() {
        assertFalse(TransferRules.isTransferUrl(null))
        assertFalse(TransferRules.isTransferUrl(" "))
        assertFalse(TransferRules.isTransferUrl("/s3/ok"))
        assertFalse(TransferRules.isTransferUrl("file:///tmp/a.jpg"))
        assertFalse(TransferRules.isTransferUrl("https:///no-host"))
        assertFalse(TransferRules.isTransferUrl("https://bad host/key"))
    }

    @Test
    fun requestHeaders_addsTheFileContentTypeWhenTheCallerGaveNone() {
        val sent = TransferRules.requestHeaders(mapOf("Content-Length" to "9", "x-amz-acl" to "private"), "image/png")
        assertEquals(listOf("x-amz-acl" to "private", "Content-Type" to "image/png"), sent.toList())
    }

    @Test
    fun requestHeaders_fallsBackToOctetStream() {
        assertEquals("application/octet-stream", TransferRules.requestHeaders(emptyMap(), null)["Content-Type"])
        assertEquals("application/octet-stream", TransferRules.requestHeaders(emptyMap(), " ")["Content-Type"])
    }

    @Test
    fun requestHeaders_keepsTheCallersContentTypeInAnyCase() {
        val sent = TransferRules.requestHeaders(mapOf("content-type" to "image/jpeg"), "image/png")
        assertEquals(mapOf("content-type" to "image/jpeg"), sent)
    }

    @Test
    fun parseProviderCode_isNullForEmptyOrBlankCodes() {
        assertNull(TransferRules.parseProviderCode(null))
        assertNull(TransferRules.parseProviderCode(""))
        assertNull(TransferRules.parseProviderCode("<Code>   </Code>"))
    }

    @Test
    fun parseProviderCode_takesTheFirstCodeTrimmed() {
        assertEquals("AccessDenied", TransferRules.parseProviderCode("<Code> AccessDenied </Code><Code>Other</Code>"))
    }

    @Test
    fun sanitizeMessage_replacesEveryUrlWithAnyScheme() {
        assertEquals(
            "a [url] b [url] c",
            TransferRules.sanitizeMessage("a https://x.example/p?q=1 b content://media/external/1 c"),
        )
    }

    @Test
    fun sanitizeMessage_keepsNullAndShortTextAsIs() {
        assertNull(TransferRules.sanitizeMessage(null))
        assertEquals("", TransferRules.sanitizeMessage(""))
        assertEquals("timeout", TransferRules.sanitizeMessage("timeout"))
    }

    @Test
    fun truncateUtf8_keepsExactFit_andNeverSplitsASurrogatePair() {
        assertEquals("a".repeat(200), TransferRules.truncateUtf8("a".repeat(200), 200))
        // "a" + four-byte emoji = 5 bytes; a 4-byte budget must drop the whole emoji.
        val emoji = String(Character.toChars(0x1F600))
        assertEquals("a", TransferRules.truncateUtf8("a$emoji", 4))
        assertEquals("a$emoji", TransferRules.truncateUtf8("a$emoji", 5))
        // Two-byte characters.
        assertEquals("éé", TransferRules.truncateUtf8("ééé", 5))
    }

    @Test
    fun safeHost_returnsOnlyTheHost() {
        assertEquals("bucket.example.com", TransferRules.safeHost("https://bucket.example.com/key?X-Amz-Signature=s"))
        assertEquals("unparsable", TransferRules.safeHost("not a url with spaces"))
        assertEquals("unparsable", TransferRules.safeHost(null))
    }
}
