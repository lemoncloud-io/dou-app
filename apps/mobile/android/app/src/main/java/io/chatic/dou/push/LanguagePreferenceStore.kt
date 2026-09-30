package io.chatic.dou.push

import android.content.Context

/**
 * The language chosen in the app's Settings, shared with [ChaticFirebaseMessagingService].
 *
 * The messaging service builds banners while the app may not be running, so it cannot ask the app's
 * preference store; the RN side copies the choice here through the SharedLanguage module instead —
 * the same arrangement [BadgeStore] has for the badge. The value is `system`, `ko` or `en`; only the
 * last two pin a language, and anything else leaves the device language in charge.
 */
object LanguagePreferenceStore {
    private const val PREFS_NAME = "chatic_language"
    private const val KEY_PREFERENCE = "preference"
    private val KNOWN = setOf("system", "ko", "en")

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun set(context: Context, preference: String) {
        val value = if (preference in KNOWN) preference else "system"
        prefs(context).edit().putString(KEY_PREFERENCE, value).apply()
    }

    /** The pinned language (`ko`/`en`), or null when the device language should decide. */
    fun pinnedLanguage(context: Context): String? =
        when (val value = prefs(context).getString(KEY_PREFERENCE, null)) {
            "ko", "en" -> value
            else -> null
        }
}
