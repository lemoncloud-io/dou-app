package io.chatic.dou.module

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.chatic.dou.push.LanguagePreferenceStore

/**
 * Copies the language choice the web made in Settings into [LanguagePreferenceStore], where the
 * messaging service reads it to pick the locale file for a background push banner.
 */
class SharedLanguageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SharedLanguage"
    }

    @ReactMethod
    fun set(preference: String, promise: Promise) {
        try {
            LanguagePreferenceStore.set(reactApplicationContext, preference)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHARED_LANGUAGE_FAILED", e.message)
        }
    }
}
