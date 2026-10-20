package io.chatic.dou.push

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayInputStream

class PushThumbnailTest {

    @Test
    fun acceptsOnlyAnHttpsAddress() {
        assertEquals("https://cdn.example.com/a.png", acceptedThumbnailUrl("https://cdn.example.com/a.png"))
        assertEquals("https://cdn.example.com/a.png", acceptedThumbnailUrl("  https://cdn.example.com/a.png "))
        assertEquals("HTTPS://cdn.example.com/a.png", acceptedThumbnailUrl("HTTPS://cdn.example.com/a.png"))
    }

    // What the server sends today is a data: URI; a payload must not point the device at plain HTTP
    // or a local address either.
    @Test
    fun ignoresAnythingThatIsNotAnHttpsAddress() {
        assertNull(acceptedThumbnailUrl(null))
        assertNull(acceptedThumbnailUrl(""))
        assertNull(acceptedThumbnailUrl("https://"))
        assertNull(acceptedThumbnailUrl("http://cdn.example.com/a.png"))
        assertNull(acceptedThumbnailUrl("data:image/png;base64,iVBORw0KGgo="))
        assertNull(acceptedThumbnailUrl("file:///sdcard/a.png"))
        assertNull(acceptedThumbnailUrl("/relative/a.png"))
    }

    @Test
    fun readsAStreamWithinTheCapWhole() {
        val bytes = ByteArray(20_000) { it.toByte() }
        assertArrayEquals(bytes, readCapped(ByteArrayInputStream(bytes), 20_000))
        assertArrayEquals(ByteArray(0), readCapped(ByteArrayInputStream(ByteArray(0)), 10))
    }

    @Test
    fun givesUpOnAStreamPastTheCap() {
        assertNull(readCapped(ByteArrayInputStream(ByteArray(20_001)), 20_000))
        assertNull(readCapped(ByteArrayInputStream(ByteArray(PUSH_THUMBNAIL_MAX_BYTES + 1)), PUSH_THUMBNAIL_MAX_BYTES))
    }

    @Test
    fun samplesDownWhileTheShorterEdgeStaysAboveTheTarget() {
        assertEquals(1, thumbnailSampleSize(256, 256, 256))
        assertEquals(1, thumbnailSampleSize(300, 300, 256))
        assertEquals(2, thumbnailSampleSize(512, 600, 256))
        assertEquals(8, thumbnailSampleSize(4032, 3024, 256))
        assertEquals(1, thumbnailSampleSize(100, 1000, 256))
    }

    // A strip whose short edge is already small would otherwise decode at full width.
    @Test
    fun samplesDownAVeryWideImageByItsLongerEdge() {
        assertEquals(32, thumbnailSampleSize(20_000, 300, 256))
        assertEquals(2, thumbnailSampleSize(100, 2000, 256))
    }

    @Test
    fun remembersAnImageAndAFailureUntilTheyExpire() {
        val cache = PushThumbnailCache<String>(maxEntries = 2)
        assertNull(cache.get("a", 0))

        cache.put("a", "icon", expiresAt = 100)
        cache.put("b", null, expiresAt = 100)
        assertEquals("icon", cache.get("a", 50)?.value)
        // A remembered failure is a hit with no value, not a miss.
        assertNotNull(cache.get("b", 50))
        assertNull(cache.get("b", 50)?.value)

        assertNull(cache.get("a", 100))
    }

    @Test
    fun dropsTheOldestEntryPastItsSize() {
        val cache = PushThumbnailCache<String>(maxEntries = 2)
        cache.put("a", "1", 100)
        cache.put("b", "2", 100)
        cache.put("c", "3", 100)
        assertNull(cache.get("a", 0))
        assertEquals("3", cache.get("c", 0)?.value)
    }

    // The group shapes put the sender at {0} and move the message to {1}.
    @Test
    fun fillsATwoArgGroupTemplateAndFallsBackWhenTheSecondIsMissing() {
        assertEquals("Sunny : hi", formatPushTemplate("{0} : {1}", listOf("Sunny", "hi"), "New message"))
        assertEquals("[Thread] Sunny: Sent 3 photos", formatPushTemplate("[Thread] {0}: Sent {1} photos", listOf("Sunny", "3"), "New message"))
        assertEquals("New message", formatPushTemplate("{0} : {1}", listOf("Sunny"), "New message"))
    }
}
