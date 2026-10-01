package io.chatic.dou.push

import org.junit.Assert.assertEquals
import org.junit.Test

class FormatPushTemplateTest {

    @Test
    fun fillsEveryPlaceholderTheArgsReach() {
        assertEquals("Sent 3 photos", formatPushTemplate("Sent {0} photos", listOf("3"), "New message"))
        assertEquals("hello", formatPushTemplate("{0}", listOf("hello"), "New message"))
    }

    @Test
    fun leavesATemplateWithNoPlaceholderAlone() {
        assertEquals("Sent a photo", formatPushTemplate("Sent a photo", emptyList(), "New message"))
    }

    // The case this guard exists for: an attachment-only message sends the text body key with no args.
    @Test
    fun fallsBackWhenAPlaceholderGetsNoArg() {
        assertEquals("New message", formatPushTemplate("{0}", emptyList(), "New message"))
        assertEquals("New message", formatPushTemplate("{0} and {1}", listOf("a"), "New message"))
    }

    @Test
    fun dropsUnfilledPlaceholdersAndTrimsWhenThereIsNoFallback() {
        assertEquals("is ready", formatPushTemplate("{0} is ready", emptyList(), null))
        assertEquals("", formatPushTemplate("{0}", emptyList(), null))
        assertEquals("a and", formatPushTemplate("{0} and {1}", listOf("a"), null))
    }

    @Test
    fun keepsAnArgThatLooksLikeAPlaceholder() {
        assertEquals("use {0} here", formatPushTemplate("{0}", listOf("use {0} here"), "New message"))
        assertEquals("see {1}", formatPushTemplate("{0}", listOf("see {1}"), "New message"))
    }

    @Test
    fun treatsAnOverlongIndexAsAHole() {
        assertEquals("New message", formatPushTemplate("{99999999999}", listOf("a"), "New message"))
    }
}
