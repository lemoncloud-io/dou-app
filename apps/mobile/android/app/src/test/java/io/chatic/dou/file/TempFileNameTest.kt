package io.chatic.dou.file

import org.junit.Assert.assertEquals
import org.junit.Test

class TempFileNameTest {

    @Test
    fun keepsAPlainName() {
        assertEquals("photo-1_a.jpg", TempFileName.safe("photo-1_a.jpg"))
    }

    @Test
    fun dropsPathSegmentsOfEitherSeparator() {
        assertEquals("passwd", TempFileName.safe("../../etc/passwd"))
        assertEquals("evil.txt", TempFileName.safe("C:\\tmp\\evil.txt"))
    }

    @Test
    fun replacesUnsafeCharactersButKeepsLettersOfAnyScript() {
        assertEquals("my_photo__1_.jpg", TempFileName.safe("my photo (1).jpg"))
        assertEquals("\u00E9t\u00E9.png", TempFileName.safe("\u00E9t\u00E9.png"))
    }

    @Test
    fun stripsLeadingDots() {
        assertEquals("hidden", TempFileName.safe(".hidden"))
    }

    @Test
    fun fallsBackWhenNothingIsLeft() {
        assertEquals(TempFileName.FALLBACK, TempFileName.safe(null))
        assertEquals(TempFileName.FALLBACK, TempFileName.safe(""))
        assertEquals(TempFileName.FALLBACK, TempFileName.safe(".."))
        assertEquals(TempFileName.FALLBACK, TempFileName.safe("dir/"))
    }

    @Test
    fun keepsTheEndOfAnOverlongName() {
        val safe = TempFileName.safe("a".repeat(200) + ".jpeg")
        assertEquals(TempFileName.MAX_LENGTH, safe.length)
        assertEquals(true, safe.endsWith(".jpeg"))
    }
}
