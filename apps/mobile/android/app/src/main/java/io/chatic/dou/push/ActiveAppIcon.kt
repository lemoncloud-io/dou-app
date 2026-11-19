package io.chatic.dou.push

import android.content.ComponentName
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.ColorInt
import androidx.core.content.ContextCompat
import io.chatic.dou.R
import io.chatic.dou.module.LauncherAliases
import io.chatic.dou.module.NativeLogger

/**
 * The accent of the launcher icon the user has active, for the circle behind a push banner's small
 * icon — so the banner takes the colour of the icon they picked.
 *
 * Read on every push rather than cached, because an icon switch only flips which alias is enabled
 * and nothing tells this service; reading the package manager costs well under a millisecond.
 */
object ActiveAppIcon {

    private const val TAG = "ActiveAppIcon"
    private const val MAIN_ACTIVITY = "io.chatic.dou.MainActivity"
    private const val ACCENT_META = "io.chatic.dou.notification_accent"

    @ColorInt
    fun accent(context: Context): Int {
        val fallback = ContextCompat.getColor(context, R.color.notification_accent_default)
        return try {
            val accentRes = activeAlias(context, context.packageManager)?.metaData?.getInt(ACCENT_META, 0) ?: 0
            if (accentRes != 0) ContextCompat.getColor(context, accentRes) else fallback
        } catch (e: Exception) {
            // The banner matters more than its colour: never let the icon lookup stop it.
            NativeLogger.log("warn", TAG, "active icon unreadable, using the default accent: ${e.javaClass.simpleName}")
            fallback
        }
    }

    private fun activeAlias(context: Context, pm: PackageManager): ActivityInfo? {
        val activities = packageActivities(pm, context.packageName)
        val states = activities.map {
            LauncherAliases.AliasState(
                name = it.name,
                targetActivity = it.targetActivity,
                manifestEnabled = it.enabled,
                setting = pm.getComponentEnabledSetting(ComponentName(context.packageName, it.name)),
            )
        }
        val name = LauncherAliases.activeIcon(states, MAIN_ACTIVITY) ?: return null
        return activities.firstOrNull { it.name == name }
    }

    /** Disabled aliases included (most icon aliases are), with their meta-data. */
    private fun packageActivities(pm: PackageManager, packageName: String): List<ActivityInfo> {
        val flags = PackageManager.GET_ACTIVITIES or
            PackageManager.MATCH_DISABLED_COMPONENTS or
            PackageManager.GET_META_DATA
        val info = if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, flags)
        }
        return info.activities.orEmpty().toList()
    }
}
