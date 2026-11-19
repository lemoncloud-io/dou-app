package io.chatic.dou.push

import android.content.ComponentName
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import androidx.annotation.ColorInt
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.toBitmap
import io.chatic.dou.R
import io.chatic.dou.module.LauncherAliases
import io.chatic.dou.module.NativeLogger

/**
 * The launcher icon the user has active, so a push banner looks like the icon they picked: its
 * picture as the large icon and its accent behind the small icon.
 *
 * Read on every push rather than cached, because an icon switch only flips which alias is enabled
 * and nothing tells this service; reading the package manager costs well under a millisecond.
 */
class ActiveAppIcon(@ColorInt val accent: Int, val picture: Bitmap?) {

    companion object {
        private const val TAG = "ActiveAppIcon"
        private const val MAIN_ACTIVITY = "io.chatic.dou.MainActivity"
        private const val ACCENT_META = "io.chatic.dou.notification_accent"

        /** Large icon side: 64 dp at xxhdpi, the most a banner draws it at. */
        private const val PICTURE_PX = 192

        fun read(context: Context): ActiveAppIcon {
            val fallbackAccent = ContextCompat.getColor(context, R.color.notification_accent_default)
            return try {
                val pm = context.packageManager
                val active = activeAlias(context, pm)
                val accentRes = active?.metaData?.getInt(ACCENT_META, 0) ?: 0
                val accent = if (accentRes != 0) ContextCompat.getColor(context, accentRes) else fallbackAccent
                val drawable = active?.loadIcon(pm) ?: pm.getApplicationIcon(context.applicationInfo)
                ActiveAppIcon(accent, drawable.toBitmap(PICTURE_PX, PICTURE_PX))
            } catch (e: Exception) {
                // The banner matters more than its looks: never let the icon lookup stop it.
                NativeLogger.log("warn", TAG, "active icon unreadable, using defaults: ${e.javaClass.simpleName}")
                ActiveAppIcon(fallbackAccent, null)
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
}
