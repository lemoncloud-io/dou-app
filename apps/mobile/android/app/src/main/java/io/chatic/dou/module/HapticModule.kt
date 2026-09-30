package io.chatic.dou.module

import android.view.HapticFeedbackConstants
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Plays the short haptics the web asks for at a gesture's decisive moment (a row swipe reaching its
 * actions, a pull reaching the refresh point).
 *
 * Played through the window's view rather than the vibrator service: `performHapticFeedback` needs no
 * VIBRATE permission, uses the device's own tuned effects, and is skipped when the user has turned
 * touch feedback off — a haptic the user opted out of is not the app's to force. The kinds are feels,
 * not gestures; anything this build does not know is ignored.
 */
class HapticModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "Haptic"
    }

    @ReactMethod
    fun trigger(kind: String) {
        val constant = when (kind) {
            "selection" -> HapticFeedbackConstants.CLOCK_TICK
            "impact" -> HapticFeedbackConstants.VIRTUAL_KEY
            else -> return
        }
        val activity = reactApplicationContext.currentActivity ?: return
        UiThreadUtil.runOnUiThread {
            activity.window?.decorView?.performHapticFeedback(constant)
        }
    }
}
