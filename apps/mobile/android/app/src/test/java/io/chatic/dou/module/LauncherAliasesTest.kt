package io.chatic.dou.module

import io.chatic.dou.module.LauncherAliases.Alias
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LauncherAliasesTest {

    private val main = "io.chatic.dou.MainActivity"

    private val icons = listOf(
        "io.chatic.dou.DefaultIcon",
        "io.chatic.dou.WhiteIcon",
        "io.chatic.dou.AuroraIcon",
    )

    @Test
    fun iconAliasesKeepsOnlyIconNamedAliasesOfTheMainActivity() {
        val declared = listOf(
            Alias("io.chatic.dou.DefaultIcon", main),
            Alias("io.chatic.dou.WhiteIcon", main),
            Alias("io.chatic.dou.ShareEntry", main),
            Alias("io.chatic.dou.OtherIcon", "io.chatic.dou.OtherActivity"),
            Alias("io.chatic.dou.MainActivity", null),
        )
        assertEquals(
            listOf("io.chatic.dou.DefaultIcon", "io.chatic.dou.WhiteIcon"),
            LauncherAliases.iconAliases(declared, main),
        )
    }

    @Test
    fun planEnablesTheTargetAndDisablesEveryOtherIcon() {
        assertEquals(
            LauncherAliases.Plan(
                enable = "io.chatic.dou.AuroraIcon",
                disable = listOf("io.chatic.dou.DefaultIcon", "io.chatic.dou.WhiteIcon"),
            ),
            LauncherAliases.plan("io.chatic.dou.AuroraIcon", icons),
        )
    }

    @Test
    fun planRefusesATargetThatIsNotADeclaredIcon() {
        assertNull(LauncherAliases.plan("io.chatic.dou.MissingIcon", icons))
    }

    @Test
    fun planNamesEachAliasOnceEvenIfListedTwice() {
        assertEquals(
            listOf("io.chatic.dou.DefaultIcon"),
            LauncherAliases.plan(
                "io.chatic.dou.WhiteIcon",
                listOf("io.chatic.dou.DefaultIcon", "io.chatic.dou.DefaultIcon", "io.chatic.dou.WhiteIcon"),
            )?.disable,
        )
    }
}
