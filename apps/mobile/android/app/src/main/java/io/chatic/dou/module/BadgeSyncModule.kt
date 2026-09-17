package io.chatic.dou.module

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.chatic.dou.push.BadgeStore

/**
 * Bridges the web's authoritative badge total into the native [BadgeStore] so a later background
 * push can increment from the true value rather than from zero. Called by the JS NotificationService
 * whenever the web pushes an absolute badge count (foreground re-aggregation).
 *
 * Android only: on iOS the base is captured natively in AppDelegate from the live icon badge.
 */
class BadgeSyncModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "BadgeSync"
    }

    @ReactMethod
    fun setBase(count: Double, promise: Promise) {
        try {
            // RN marshals JS numbers as Double; the badge count is a whole number.
            BadgeStore.setCount(reactApplicationContext, count.toInt())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BADGE_SYNC_FAILED", e.message)
        }
    }

    /**
     * Reads the shared counter back.
     *
     * The counter is the only place on Android that knows the real badge value: notifee's badge API
     * is iOS-only, and the launcher number is driven by the posted notification rather than by
     * anything readable. Without this the web can write the badge but never check it, which is why
     * a badge that disagreed with the in-app unread count left no evidence (ADR-0099).
     */
    @ReactMethod
    fun getBase(promise: Promise) {
        try {
            promise.resolve(BadgeStore.getCount(reactApplicationContext))
        } catch (e: Exception) {
            promise.reject("BADGE_SYNC_FAILED", e.message)
        }
    }
}
