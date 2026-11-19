package io.chatic.dou.module

import android.content.pm.PackageManager

/**
 * Which launcher aliases to turn on and off when the app icon changes.
 *
 * The caller passes the alias JS believes is active, but that is only what JS stored last
 * time — it can be stale (a switch that failed half-way, storage cleared while the app kept
 * running). Turning off every other icon alias, instead of only the one JS named, keeps the
 * launcher at exactly one DoU icon whatever JS remembered.
 */
object LauncherAliases {

    /** An alias declared in the manifest: its fully qualified name and the activity it opens. */
    data class Alias(val name: String, val targetActivity: String?)

    /** The switch to make: enable [enable], then disable everything in [disable]. */
    data class Plan(val enable: String, val disable: List<String>)

    /**
     * The icon aliases among [declared]: those opening [mainActivity] whose name ends in `Icon`.
     * The suffix keeps an alias added later for another reason (a share or deep-link entry that
     * also opens the main activity) from being switched off by an icon change.
     */
    fun iconAliases(declared: Collection<Alias>, mainActivity: String): List<String> =
        declared.filter { isIconAlias(it.name, it.targetActivity, mainActivity) }.map { it.name }.distinct()

    /**
     * An alias with what decides whether it is on: [manifestEnabled] is its `android:enabled`, and
     * [setting] is the package manager's `COMPONENT_ENABLED_STATE_*` for it, which an icon switch writes.
     */
    data class AliasState(
        val name: String,
        val targetActivity: String?,
        val manifestEnabled: Boolean,
        val setting: Int,
    )

    /**
     * The icon alias the launcher shows now, or null when none is on. An alias never switched
     * keeps its manifest value (`DEFAULT`), so a fresh install reads as DefaultIcon.
     */
    fun activeIcon(aliases: Collection<AliasState>, mainActivity: String): String? =
        aliases.firstOrNull { isIconAlias(it.name, it.targetActivity, mainActivity) && isOn(it) }?.name

    private fun isIconAlias(name: String, targetActivity: String?, mainActivity: String): Boolean =
        targetActivity == mainActivity && name.endsWith("Icon")

    private fun isOn(alias: AliasState): Boolean = when (alias.setting) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> alias.manifestEnabled
        else -> false
    }

    /**
     * The switch to [target], or null when [target] is not one of [iconAliases] — refused before
     * anything changes, since disabling the others and then failing to enable an unknown alias
     * would leave the app with no launcher icon at all.
     */
    fun plan(target: String, iconAliases: Collection<String>): Plan? {
        if (target !in iconAliases) return null
        return Plan(enable = target, disable = iconAliases.filter { it != target }.distinct())
    }
}
