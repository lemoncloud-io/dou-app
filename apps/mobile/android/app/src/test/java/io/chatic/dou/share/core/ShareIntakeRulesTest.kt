package io.chatic.dou.share.core

import io.chatic.dou.share.core.ShareIntakeRules.StreamCheck
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareIntakeRulesTest {

    private val own = setOf("io.chatic.dou.share.fileprovider", "io.chatic.dou.androidx-startup")

    // --- Which intents are a share ---

    @Test
    fun aSendOrSendMultipleDeliveredFreshIsAShare() {
        assertTrue(ShareIntakeRules.isShare("android.intent.action.SEND", launchedFromHistory = false, restored = false))
        assertTrue(ShareIntakeRules.isShare("android.intent.action.SEND_MULTIPLE", launchedFromHistory = false, restored = false))
        assertFalse(ShareIntakeRules.isShare("android.intent.action.VIEW", launchedFromHistory = false, restored = false))
        assertFalse(ShareIntakeRules.isShare(null, launchedFromHistory = false, restored = false))
    }

    @Test
    fun aShareRedeliveredFromRecentsOrARestoredScreenIsNotTakenAgain() {
        assertFalse(ShareIntakeRules.isShare("android.intent.action.SEND", launchedFromHistory = true, restored = false))
        assertFalse(ShareIntakeRules.isShare("android.intent.action.SEND", launchedFromHistory = false, restored = true))
    }

    // --- Which streams are taken ---

    @Test
    fun takesOnlyAStreamTheSenderGrantedReadAccessTo() {
        val photo = "content://media/external/images/media/12"
        val granted = setOf(photo)
        assertTrue(ShareIntakeRules.isGranted(photo, grantsRead = true, granted = granted))
        // No grant flag: the system never checked that the sender may read it, and this app would read
        // it with its own permissions.
        assertFalse(ShareIntakeRules.isGranted(photo, grantsRead = false, granted = granted))
        // Named only in the extra, not among the granted URIs.
        assertFalse(
            ShareIntakeRules.isGranted("content://com.android.contacts/contacts/as_multi_vcard/x", grantsRead = true, granted = granted),
        )
    }

    @Test
    fun takesAContentStreamFromAnotherApp() {
        assertEquals(StreamCheck.Accepted, ShareIntakeRules.checkStream("content", "com.google.android.apps.photos.contentprovider", own))
        assertEquals(StreamCheck.Accepted, ShareIntakeRules.checkStream("CONTENT", "media", own))
    }

    @Test
    fun refusesAFileStream() {
        assertTrue(ShareIntakeRules.checkStream("file", "", own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("file", null, own) is StreamCheck.Refused)
    }

    @Test
    fun refusesAStreamFromThisAppsOwnProviders() {
        assertTrue(ShareIntakeRules.checkStream("content", "io.chatic.dou.share.fileprovider", own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("content", "IO.Chatic.Dou.Share.FileProvider", own) is StreamCheck.Refused)
    }

    @Test
    fun refusesThisAppsOwnProviderBehindAUserPrefix() {
        // The resolver drops `<userId>@` before it finds the provider, so the prefix must not hide it.
        assertTrue(ShareIntakeRules.checkStream("content", "0@io.chatic.dou.share.fileprovider", own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("content", "10@IO.Chatic.Dou.Share.FileProvider", own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("content", "0@", own) is StreamCheck.Refused)
        assertEquals(StreamCheck.Accepted, ShareIntakeRules.checkStream("content", "10@media", own))
    }

    @Test
    fun refusesAStreamWithNoSchemeOrNoAuthority() {
        assertTrue(ShareIntakeRules.checkStream(null, "media", own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("content", null, own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("content", "", own) is StreamCheck.Refused)
        assertTrue(ShareIntakeRules.checkStream("https", "example.com", own) is StreamCheck.Refused)
    }

    @Test
    fun ownAuthoritiesSplitTheDeclaredListsAndIgnoreBlanks() {
        assertEquals(
            setOf("a.one", "a.two", "b"),
            ShareIntakeRules.ownAuthorities(listOf("a.one;A.Two", null, " b ", "", ";")),
        )
    }

    // --- The id ---

    @Test
    fun anIdIsAUuid() {
        assertTrue(ShareIntakeRules.isIntakeId("3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b"))
        assertTrue(ShareIntakeRules.isIntakeId("3F2B8C1E-9A4D-4E7F-8B21-0C5D6E7F8A9B"))
        assertFalse(ShareIntakeRules.isIntakeId(null))
        assertFalse(ShareIntakeRules.isIntakeId(""))
        assertFalse(ShareIntakeRules.isIntakeId("../attach-pick"))
        assertFalse(ShareIntakeRules.isIntakeId("3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b/.."))
        assertFalse(ShareIntakeRules.isIntakeId("3f2b8c1e9a4d4e7f8b210c5d6e7f8a9b"))
    }

    @Test
    fun theShareUrlCarriesTheIdOnTheFlavorsScheme() {
        assertEquals("chatic-dev://share?id=abc", ShareIntakeRules.shareUrl("chatic-dev", "abc"))
    }

    // --- What is copied ---

    @Test
    fun onlyTheFirstTenItemsAreCopiedAndTheRestAreNamed() {
        val streams = (1..12).toList()
        val split = ShareIntakeRules.split(streams)
        assertEquals((1..10).toList(), split.copied)
        assertEquals(listOf(11, 12), split.over)
    }

    @Test
    fun aShareOfTenOrFewerCopiesEverything() {
        val split = ShareIntakeRules.split(listOf("a", "b"))
        assertEquals(listOf("a", "b"), split.copied)
        assertTrue(split.over.isEmpty())
    }

    @Test
    fun eachItemIsHeldToTheLimitItsFormatImplies() {
        assertEquals(20L * 1024 * 1024, ShareIntakeRules.limitFor("image/jpeg", "IMG_1.jpg"))
        assertEquals(300L * 1024 * 1024, ShareIntakeRules.limitFor("video/mp4", "clip.mp4"))
        assertEquals(50L * 1024 * 1024, ShareIntakeRules.limitFor("application/pdf", "a.pdf"))
        assertEquals(20L * 1024 * 1024, ShareIntakeRules.limitFor(null, "IMG_1.png"))
    }

    @Test
    fun sharedTextIsTrimmedAndBlankIsNone() {
        assertEquals("https://example.com", ShareIntakeRules.sharedText("  https://example.com\n"))
        assertNull(ShareIntakeRules.sharedText("   "))
        assertNull(ShareIntakeRules.sharedText(null))
    }
}
