package io.chatic.dou.module

import android.content.ComponentName
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppIconManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "AppIconManager"
    }

    /**
     * Switches the launcher alias. [disableAlias] is what JS last stored as active; it is kept
     * in the signature for the JS side, but every other icon alias is turned off too, so a
     * stale value can never leave two DoU icons on the launcher.
     */
    @ReactMethod
    fun changeIcon(enableAlias: String, @Suppress("UNUSED_PARAMETER") disableAlias: String, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val applicationId = reactApplicationContext.packageName
            val baseNamespace = "io.chatic.dou"

            val declared = packageInfo(pm, applicationId).activities.orEmpty()
                .map { LauncherAliases.Alias(it.name, it.targetActivity) }
            val icons = LauncherAliases.iconAliases(declared, "$baseNamespace.MainActivity")
            val plan = LauncherAliases.plan("$baseNamespace.$enableAlias", icons)
            if (plan == null) {
                promise.reject("ICON_CHANGE_FAILED", "Unknown icon alias: $enableAlias")
                return
            }

            // Enable before disabling, so the launcher is never without a DoU entry.
            pm.setComponentEnabledSetting(
                ComponentName(applicationId, plan.enable),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )
            for (alias in plan.disable) {
                pm.setComponentEnabledSetting(
                    ComponentName(applicationId, alias),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                )
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ICON_CHANGE_FAILED", e.message)
        }
    }

    /** The package's activities and aliases, disabled ones included — the icon aliases mostly are. */
    private fun packageInfo(pm: PackageManager, applicationId: String): PackageInfo {
        val flags = PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS
        return if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(applicationId, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(applicationId, flags)
        }
    }
}
