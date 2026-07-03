package io.chatic.dou.push

import android.content.Context

/**
 * Shared app-icon badge counter for Android.
 *
 * Android exposes no API to read the launcher badge back, so a backgrounded push handler cannot
 * increment "the current badge" directly — it has to keep its own count. This store is that single
 * source of truth: the web writes the authoritative total here (via the BadgeSync native module)
 * whenever it re-aggregates unread, and [ChaticFirebaseMessagingService] bumps it by one per
 * background chat push. Both sides share one dedicated SharedPreferences file so the count survives
 * the app being suspended/killed.
 *
 * The mirror of this on iOS is an App Group UserDefaults counter; the split exists only because iOS
 * *can* read its live badge (captured in AppDelegate) while Android cannot.
 */
object BadgeStore {
    private const val PREFS_NAME = "chatic_badge"
    private const val KEY_COUNT = "badge_count"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Current badge count; 0 when never set. */
    fun getCount(context: Context): Int = prefs(context).getInt(KEY_COUNT, 0)

    /** Overwrite the badge count with the authoritative value from the web re-aggregation. */
    fun setCount(context: Context, count: Int) {
        // Clamp to non-negative: a negative badge is meaningless and would break setNumber().
        prefs(context).edit().putInt(KEY_COUNT, count.coerceAtLeast(0)).apply()
    }

    /** Increment by one for an incoming background push and return the new count. */
    fun increment(context: Context): Int {
        val next = getCount(context) + 1
        prefs(context).edit().putInt(KEY_COUNT, next).apply()
        return next
    }
}
