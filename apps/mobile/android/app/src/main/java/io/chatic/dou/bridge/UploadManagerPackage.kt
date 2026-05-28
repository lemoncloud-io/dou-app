package io.chatic.dou.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * UploadManagerPackage
 *
 * This is a scaffolding package for the next phase:
 * - Moving actual upload execution into native code (OkHttp/WorkManager/etc.)
 * - Exposing start/pause/resume/cancel APIs to JS
 *
 * For now it only wires the module, without performing network uploads.
 */
class UploadManagerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(UploadManagerModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}

