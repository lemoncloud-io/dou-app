package io.chatic.dou.push

import org.junit.Assert.assertEquals
import org.junit.Test

class CloudRootTapLinkTest {

    @Test
    fun carriesTheCloudOnTheSchemeRoot() {
        assertEquals("chatic://?cid=1000002", cloudRootTapLink("chatic", "1000002"))
        assertEquals("chatic-dev://?cid=1000002", cloudRootTapLink("chatic-dev", "1000002"))
    }

    @Test
    fun staysOnTheBareRootWhenThePushNamesNoCloud() {
        assertEquals("chatic://", cloudRootTapLink("chatic", ""))
        assertEquals("chatic://", cloudRootTapLink("chatic", "   "))
    }

    @Test
    fun encodesACloudIdThatIsNotUrlSafe() {
        assertEquals("chatic://?cid=a%26b%3Dc", cloudRootTapLink("chatic", "a&b=c"))
    }
}
