package io.chatic.dou.module

import android.app.UiModeManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import io.chatic.dou.splash.BootSplashState

class BootSplashModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "BootSplash"
    }

    /**
     * Lets the held splash go. Resolves true if this call released it, false if it was already gone
     * (a repeat call, or the safety cap in MainActivity got there first).
     *
     * `fade` is part of the shared JS contract and only iOS honours it: here the system removes its
     * own splash with its default exit, because a custom exit animation is what made the system
     * hand the splash over to the app — see MainActivity.
     */
    @ReactMethod
    @Suppress("UNUSED_PARAMETER")
    fun hide(fade: Boolean, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            promise.resolve(BootSplashState.release())
        }
    }

    /**
     * Records the in-app theme with the system so the next launch's splash — drawn by the system
     * before any app code runs — already uses its background and system-bar colours.
     *
     * Android 12+ persists a per-app night mode and draws the splash from it. That also changes this
     * process's configuration `uiMode` immediately, which is safe here: MainActivity declares
     * `uiMode` in `android:configChanges`, so nothing is recreated, and the RN theme resolver only
     * reads the OS colour scheme for 'system' — which maps to MODE_NIGHT_AUTO, i.e. back to the OS
     * value. Below 12 there is no such API; the splash there follows the OS theme and this resolves
     * false.
     */
    @ReactMethod
    fun setStartupTheme(theme: String, promise: Promise) {
        val mode = when (theme) {
            "light" -> UiModeManager.MODE_NIGHT_NO
            "dark" -> UiModeManager.MODE_NIGHT_YES
            "system" -> UiModeManager.MODE_NIGHT_AUTO
            else -> null
        }
        if (mode == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            promise.resolve(false)
            return
        }

        val uiModeManager = reactApplicationContext.getSystemService(UiModeManager::class.java)
        if (uiModeManager == null) {
            promise.resolve(false)
            return
        }

        try {
            uiModeManager.setApplicationNightMode(mode)
            promise.resolve(true)
        } catch (error: Exception) {
            // Best effort: a failure only means the next splash keeps the OS theme.
            promise.resolve(false)
        }
    }
}
