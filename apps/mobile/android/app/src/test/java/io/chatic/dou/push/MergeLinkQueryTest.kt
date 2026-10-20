package io.chatic.dou.push

import org.junit.Assert.assertEquals
import org.junit.Test

class MergeLinkQueryTest {

    @Test
    fun appendsTheContextToARoomLink() {
        assertEquals(
            "/channels/1000001/room?cid=c1&sid=s9&chatId=1000001%3A42",
            mergeLinkQuery("/channels/1000001/room", listOf("cid" to "c1", "sid" to "s9", "chatId" to "1000001:42"))
        )
    }

    // `Uri.parse` read `/channels/U` as a scheme here, and the whole merge threw.
    @Test
    fun handlesARoomIdThatContainsAColon() {
        assertEquals(
            "/channels/U:1002021/room?cid=%23&chatId=U%3A1002021%3A3",
            mergeLinkQuery("/channels/U:1002021/room", listOf("cid" to "#", "chatId" to "U:1002021:3"))
        )
    }

    @Test
    fun keepsTheLinkQueryAndNeverOverridesItsValues() {
        assertEquals(
            "/channels/1/room?tab=info&cid=explicit&sid=s9",
            mergeLinkQuery("/channels/1/room?tab=info&cid=explicit", listOf("cid" to "c1", "sid" to "s9"))
        )
        assertEquals(
            "/channels/1/room?chatId=explicit",
            mergeLinkQuery("/channels/1/room?chatId=explicit", listOf("chatId" to "c42"))
        )
    }

    @Test
    fun keepsAFragmentLastAndASchemeLinkIntact() {
        assertEquals("/a?x=1&cid=c1#top", mergeLinkQuery("/a?x=1#top", listOf("cid" to "c1")))
        assertEquals(
            "chatic-dev://channel?channelId=room_123&cid=c1",
            mergeLinkQuery("chatic-dev://channel?channelId=room_123", listOf("cid" to "c1"))
        )
    }

    @Test
    fun encodesValuesTheWayTheWebDecodesThem() {
        assertEquals("/a?chatId=a%20b%26c", mergeLinkQuery("/a", listOf("chatId" to "a b&c")))
    }

    @Test
    fun returnsTheLinkUnchangedWithNothingToAdd() {
        assertEquals("/a", mergeLinkQuery("/a", emptyList()))
        assertEquals("/a?cid=x", mergeLinkQuery("/a?cid=x", listOf("cid" to "y")))
    }
}
