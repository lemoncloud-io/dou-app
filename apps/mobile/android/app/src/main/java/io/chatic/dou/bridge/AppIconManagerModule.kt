package io.chatic.dou.bridge

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppIconManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "AppIconManager"
    }

    @ReactMethod
    fun changeIcon(enableAlias: String, disableAlias: String, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val applicationId = reactApplicationContext.packageName

            val baseNamespace = "io.chatic.dou"

            val enableComponent = ComponentName(applicationId, "$baseNamespace.$enableAlias")
            val disableComponent = ComponentName(applicationId, "$baseNamespace.$disableAlias")

            pm.setComponentEnabledSetting(
                disableComponent,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )

            pm.setComponentEnabledSetting(
                enableComponent,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ICON_CHANGE_FAILED", e.message)
        }
    }
}
