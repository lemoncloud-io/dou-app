package io.chatic.dou.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.chatic.dou.MainActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.Locale

class ChaticFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "ChaticPushService"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "Refreshed token: $token")
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "From: ${remoteMessage.from}")

        val data = remoteMessage.data
        if (data.isEmpty()) {
            Log.d(TAG, "Message data payload is empty. Skipping.")
            return
        }

        val messageId = data["id"] ?: data["messageId"] ?: ""
        val type = data["type"] ?: ""
        val channelId = data["channel_id"] ?: data["channelId"] ?: "dou_chat"
        val clickAction = data["link"] ?: data["clickAction"] ?: ""
        val timestamp = data["timestamp"] ?: ""
        val titleLocKey = data["title_loc_key"] ?: data["titleLocKey"] ?: ""
        val titleLocArgs = data["title_loc_args"] ?: data["titleLocArgs"] ?: ""
        val bodyLocKey = data["loc_key"] ?: data["bodyLocKey"] ?: ""
        val bodyLocArgs = data["loc_args"] ?: data["bodyLocArgs"] ?: ""
        val payload = data["data"] ?: data["payload"] ?: ""
        val silent = data["silent"]?.toBoolean() ?: false

        // 1. Resolve and translate title & body dynamically
        val lang = resolveLanguage()
        val i18nJson = loadI18nJson(this, lang)

        val finalTitle = translate(i18nJson, titleLocKey, titleLocArgs)
        val finalBody = translate(i18nJson, bodyLocKey, bodyLocArgs)

        Log.d(TAG, "Translated Title: $finalTitle, Body: $finalBody")

        // 2. Check if the app is currently in the foreground
        if (isAppInForeground(this)) {
            Log.d(TAG, "App is in foreground. Skipping native banner, emitting bridge event.")
            emitForegroundEvent(
                messageId = messageId,
                type = type,
                title = finalTitle,
                body = finalBody,
                clickAction = clickAction,
                channelId = channelId,
                timestamp = timestamp,
                payload = payload
            )
        } else {
            if (silent) {
                Log.d(TAG, "Silent push received in background. Skipping notification banner.")
            } else {
                Log.d(TAG, "App is in background/killed. Displaying native notification banner.")
                displayNotification(
                    messageId = messageId,
                    channelId = channelId,
                    title = finalTitle,
                    body = finalBody,
                    clickAction = clickAction,
                    payload = payload,
                    i18nJson = i18nJson
                )
            }
        }
    }

    private fun resolveLanguage(): String {
        val defaultLang = Locale.getDefault().language
        return if (defaultLang == "ko") "ko" else "en"
    }

    private fun loadI18nJson(context: Context, lang: String): JSONObject {
        var jsonStr: String? = null
        try {
            val inputStream = context.assets.open("locales/$lang.json")
            val size = inputStream.available()
            val buffer = ByteArray(size)
            inputStream.read(buffer)
            inputStream.close()
            jsonStr = String(buffer, Charsets.UTF_8)
        } catch (e: IOException) {
            Log.e(TAG, "Failed to load locales/$lang.json from assets", e)
        }

        // Try fallback to en if loading failed
        if (jsonStr == null && lang != "en") {
            try {
                val inputStream = context.assets.open("locales/en.json")
                val size = inputStream.available()
                val buffer = ByteArray(size)
                inputStream.read(buffer)
                inputStream.close()
                jsonStr = String(buffer, Charsets.UTF_8)
            } catch (e: IOException) {
                Log.e(TAG, "Failed to load locales/en.json from assets", e)
            }
        }

        return if (jsonStr != null) JSONObject(jsonStr) else JSONObject()
    }

    private fun translate(i18nJson: JSONObject, key: String, argsJsonStr: String): String {
        if (key.isEmpty()) return ""

        val template = resolveKey(i18nJson, key) ?: return key
        val args = parseArgs(argsJsonStr)

        var result = template
        for (i in args.indices) {
            result = result.replace("{$i}", args[i])
        }
        return result
    }

    private fun resolveKey(json: JSONObject, path: String): String? {
        val keys = path.split(".")
        var current: Any = json
        for (k in keys) {
            if (current is JSONObject) {
                if (!current.has(k)) return null
                current = current.get(k)
            } else {
                return null
            }
        }
        return current as? String
    }

    private fun parseArgs(jsonArrayStr: String): List<String> {
        if (jsonArrayStr.isEmpty()) return emptyList()
        val list = mutableListOf<String>()
        try {
            val array = JSONArray(jsonArrayStr)
            for (i in 0 until array.length()) {
                list.add(array.getString(i))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse loc args array: $jsonArrayStr", e)
        }
        return list
    }

    private fun isAppInForeground(context: Context): Boolean {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager ?: return false
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = context.packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND &&
                appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }

    private fun emitForegroundEvent(
        messageId: String,
        type: String,
        title: String,
        body: String,
        clickAction: String,
        channelId: String,
        timestamp: String,
        payload: String
    ) {
        try {
            val reactApplication = applicationContext as? ReactApplication ?: return
            val reactContext = reactApplication.reactHost?.currentReactContext ?: return

            if (reactContext.hasActiveCatalystInstance()) {
                val params = Arguments.createMap().apply {
                    putString("messageId", messageId)
                    putString("type", type)
                    putString("title", title)
                    putString("body", body)
                    putString("clickAction", clickAction)
                    putString("channelId", channelId)
                    putString("timestamp", timestamp)
                    putString("payload", payload)
                }

                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onForegroundPushReceived", params)
                Log.d(TAG, "Successfully emitted foreground push event to React Native.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit foreground push event to React Native", e)
        }
    }

    private fun displayNotification(
        messageId: String,
        channelId: String,
        title: String,
        body: String,
        clickAction: String,
        payload: String,
        i18nJson: JSONObject
    ) {
        // Ensure the notification channel is created
        createNotificationChannel(this, channelId, i18nJson)

        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            if (clickAction.isNotEmpty()) {
                data = android.net.Uri.parse(clickAction)
            }
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("clickAction", clickAction)
            putExtra("payload", payload)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            messageId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Find fallback notification icon
        var iconId = resources.getIdentifier("ic_launcher_default", "mipmap", packageName)
        if (iconId == 0) {
            iconId = applicationInfo.icon
        }
        if (iconId == 0) {
            iconId = android.R.drawable.ic_dialog_info
        }

        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(iconId)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        // Apply sound and priority according to the channel settings
        when (channelId) {
            "dou_chat_muted", "dou_marketing" -> {
                // Silent
                notificationBuilder.setSound(null)
                notificationBuilder.priority = NotificationCompat.PRIORITY_LOW
            }
            "dou_notice" -> {
                notificationBuilder.setSound(defaultSoundUri)
                notificationBuilder.priority = NotificationCompat.PRIORITY_DEFAULT
            }
            "dou_chat", "dou_cloud" -> {
                notificationBuilder.setSound(defaultSoundUri)
                notificationBuilder.priority = NotificationCompat.PRIORITY_HIGH
                notificationBuilder.setDefaults(NotificationCompat.DEFAULT_ALL)
            }
            else -> {
                notificationBuilder.setSound(defaultSoundUri)
                notificationBuilder.priority = NotificationCompat.PRIORITY_DEFAULT
            }
        }

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(messageId.hashCode(), notificationBuilder.build())
    }

    private fun createNotificationChannel(context: Context, channelId: String, i18nJson: JSONObject) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nameKey = when (channelId) {
                "dou_chat", "dou_chat_muted" -> "notification.channel.chat"
                "dou_notice" -> "notification.channel.notice"
                "dou_marketing" -> "notification.channel.marketing"
                "dou_cloud" -> "notification.channel.cloud"
                else -> null
            }
            val name = if (nameKey != null) resolveKey(i18nJson, nameKey) ?: "Alert" else "Alert"

            val importance: Int
            val enableSound: Boolean
            val enableVibration: Boolean

            when (channelId) {
                "dou_chat" -> {
                    importance = NotificationManager.IMPORTANCE_HIGH
                    enableSound = true
                    enableVibration = true
                }
                "dou_chat_muted" -> {
                    importance = NotificationManager.IMPORTANCE_LOW
                    enableSound = false
                    enableVibration = false
                }
                "dou_notice" -> {
                    importance = NotificationManager.IMPORTANCE_DEFAULT
                    enableSound = true
                    enableVibration = true
                }
                "dou_marketing" -> {
                    importance = NotificationManager.IMPORTANCE_LOW
                    enableSound = false
                    enableVibration = false
                }
                "dou_cloud" -> {
                    importance = NotificationManager.IMPORTANCE_HIGH
                    enableSound = true
                    enableVibration = true
                }
                else -> {
                    importance = NotificationManager.IMPORTANCE_DEFAULT
                    enableSound = true
                    enableVibration = true
                }
            }

            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Re-create channel to sync dynamic translated name changes
            val channel = NotificationChannel(channelId, name, importance).apply {
                if (!enableSound) {
                    setSound(null, null)
                }
                enableVibration(enableVibration)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }
}
