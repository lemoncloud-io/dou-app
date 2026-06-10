package io.chatic.dou.module

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BackNavigationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "BackNavigation"
    }

    @ReactMethod
    fun setCanGoBack(canGoBack: Boolean) {
        BackNavigationState.canGoBack = canGoBack
    }
}

object BackNavigationState {
    @Volatile
    var canGoBack: Boolean = false
}
