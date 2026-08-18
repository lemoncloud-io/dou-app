package io.chatic.dou.push

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Shared cross-cloud push mark store for Android (ADR-0056).
 *
 * Same SharedPreferences file as [BadgeStore] — the badge counter and a push mark are written at
 * the exact same call site (a background chat push), so one file covers both writes. Records hold
 * ONLY the raw hint fields (`cid`/`uid`/`channelId`/`sid`/`channelName`); this store never
 * interprets them (the relay sentinel `'#'`, an empty `cid`'s cross-partition lookup) — that
 * happens once, on the web (see resolvePushCloudId.ts). Keeping the same fields, unread, mirrors
 * the iOS App Group record shape so the web's drain handling is platform-agnostic.
 *
 * Drained (read + cleared in one call) by the JS bridge (`PushMarksModule.drain`) on boot/
 * foreground so a cloud's dot survives a background arrival the socket never saw.
 */
object PushMarkStore {
    private const val PREFS_NAME = "chatic_badge"
    private const val KEY_MARKS = "push_marks"

    /** Backstop against unbounded growth if the web build predates this bridge and never drains. */
    private const val MAX_MARKS = 100

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun readArray(store: SharedPreferences): JSONArray {
        val raw = store.getString(KEY_MARKS, null) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    /** Appends one raw hint record for an incoming background chat push. */
    fun append(context: Context, cid: String?, uid: String?, channelId: String?, sid: String?, channelName: String?) {
        val record = JSONObject().apply {
            cid?.let { put("cid", it) }
            uid?.let { put("uid", it) }
            channelId?.let { put("channelId", it) }
            sid?.let { put("sid", it) }
            channelName?.let { put("channelName", it) }
        }

        val store = prefs(context)
        val current = readArray(store)
        current.put(record)

        // Drop the oldest entries first — if this backstop ever triggers, the newest pushes are the
        // ones still worth resolving.
        val overflow = current.length() - MAX_MARKS
        val trimmed = if (overflow > 0) {
            JSONArray().apply {
                for (i in overflow until current.length()) put(current.get(i))
            }
        } else {
            current
        }

        store.edit().putString(KEY_MARKS, trimmed.toString()).apply()
    }

    /** Reads every pending mark and clears the store in the same call (drain — read-once). */
    fun drainAll(context: Context): List<Map<String, String>> {
        val store = prefs(context)
        val array = readArray(store)
        store.edit().remove(KEY_MARKS).apply()

        return (0 until array.length()).map { i ->
            val obj = array.getJSONObject(i)
            val record = mutableMapOf<String, String>()
            obj.keys().forEach { key -> record[key] = obj.getString(key) }
            record
        }
    }
}
