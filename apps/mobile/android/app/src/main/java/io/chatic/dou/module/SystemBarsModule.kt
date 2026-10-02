package io.chatic.dou.module

import android.graphics.Color
import android.os.Build
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class SystemBarsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SystemBars"
    }

    @ReactMethod
    fun setAppearance(isDark: Boolean, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }

        UiThreadUtil.runOnUiThread {
            try {
                val window = activity.window
                val decorView = window.decorView

                // From Q on, React Native's edge-to-edge setup already leaves the navigation bar
                // transparent, and Android 15 deprecates this setter. On Android 8-9 it paints a
                // scrim that follows the OS dark mode rather than the app theme, which can put
                // light icons on a light scrim — that is what the override is for. Android 7 is
                // overridden too, as it always was, though it cannot tint the icons.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                    @Suppress("DEPRECATION")
                    window.navigationBarColor = Color.TRANSPARENT
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    window.isStatusBarContrastEnforced = false
                    window.isNavigationBarContrastEnforced = false
                }

                WindowInsetsControllerCompat(window, decorView).run {
                    isAppearanceLightStatusBars = !isDark
                    isAppearanceLightNavigationBars = !isDark
                }

                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("SYSTEM_BARS_UPDATE_FAILED", error)
            }
        }
    }
}
