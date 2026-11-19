package io.chatic.dou.module

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
        declared.filter { it.targetActivity == mainActivity && it.name.endsWith("Icon") }.map { it.name }.distinct()

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
