package io.chatic.dou.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Shader
import android.media.RingtoneManager
import android.os.Build
import android.os.SystemClock
import io.chatic.dou.module.NativeLogger
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
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class ChaticFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "ChaticPushService"

        /** The one push type that carries no `link` by contract and whose tap belongs at the root. */
        private const val PUSH_TYPE_CLOUD = "cloud"

        /** Generic body for a push whose template came without the args it names. Never sent by the server. */
        private const val PUSH_BODY_FALLBACK_KEY = "push_chat_fallback_body"

        /**
         * Payload fields folded into the tap link's query. `cid`/`sid` are the session context the web
         * switches to; `chatId` lets it open the thread when the notified chat is a reply.
         */
        private val LINK_CONTEXT_KEYS = listOf("cid", "sid", "chatId")

        /** The whole budget for fetching a sender's profile image; past it the banner goes without one. */
        private const val THUMBNAIL_TIMEOUT_MS = 3_000L

        /** Pixel edge the profile image is decoded down to — a large icon never needs more. */
        private const val THUMBNAIL_EDGE_PX = 256

        /** Fetches run here so [THUMBNAIL_TIMEOUT_MS] bounds the whole fetch, not each socket read. */
        private val thumbnailExecutor = Executors.newCachedThreadPool()

        /**
         * How long a fetched image — or a failure — is reused for the same address. Messages are
         * handled one at a time, so a burst from one sender behind a slow image host would otherwise
         * wait out the budget once per message.
         */
        private const val THUMBNAIL_CACHE_MS = 60_000L

        private val thumbnailCache = PushThumbnailCache<Bitmap>(maxEntries = 16)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // The token itself is a credential (catalog rule 8) — record that it rotated, not what to.
        NativeLogger.log("info", TAG, "FCM token refreshed")
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        NativeLogger.log("debug", TAG, "From: ${remoteMessage.from}")

        val data = remoteMessage.data
        if (data.isEmpty()) {
            NativeLogger.log("debug", TAG, "Message data payload is empty. Skipping.")
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

        // Fold cid/sid/chatId from the payload into the link's query so a tapped notification carries
        // cloud/site context, and the notified chat, to the web. RN Linking only surfaces the intent
        // URI (not the payload extra), so for Android data-only pushes this native merge is the only
        // place it can happen.
        val navClickAction = mergeContextIntoLink(clickAction, payload).ifEmpty { rootTapLinkFor(type) }

        // 1. Resolve and translate title & body dynamically
        val lang = resolveLanguage()
        val i18nJson = loadI18nJson(this, lang)

        val finalTitle = translate(i18nJson, titleLocKey, titleLocArgs)
        val finalBody = translate(i18nJson, bodyLocKey, bodyLocArgs, fallbackKey = PUSH_BODY_FALLBACK_KEY)

        // Lengths, never the strings: a push title/body is message content, and `debug` entries
        // still reach the server on non-release builds.
        NativeLogger.log("debug", TAG, "Translated push copy: titleLen=${finalTitle.length}, bodyLen=${finalBody.length}")

        // 2. Check if the app is currently in the foreground
        if (isAppInForeground(this)) {
            NativeLogger.log(
                "info",
                TAG,
                "push received (foreground) — relaying to web, messageId=$messageId, channel=$channelId"
            )
            emitForegroundEvent(
                messageId = messageId,
                type = type,
                title = finalTitle,
                body = finalBody,
                clickAction = clickAction,
                channelId = channelId,
                timestamp = timestamp,
                payload = payload,
                data = data
            )
        } else {
            if (silent) {
                NativeLogger.log("info", TAG, "push received (background, silent) — no banner, messageId=$messageId")
            } else {
                // Background chat pushes bump the app-icon badge: the socket (and the web that owns
                // the badge) is suspended here, so this native handler is the only place a
                // backgrounded message can move the count. Non-chat channels (notice/marketing/cloud)
                // are excluded to stay consistent with the web's chat-only unread total.
                val badgeCount = if (isChatChannel(channelId)) {
                    // Cross-cloud push mark (ADR-0056): same gate as the badge bump — the socket
                    // that would otherwise cover this cloud is suspended right now. Record the raw
                    // hint alongside the badge so the web can resolve+mark it on the next launch.
                    val hint = parsePushCloudHint(payload)
                    if (hint.cid != null || hint.uid != null || hint.channelId != null) {
                        PushMarkStore.append(this, hint.cid, hint.uid, hint.channelId, hint.sid, hint.channelName)
                    }
                    BadgeStore.increment(this)
                } else {
                    null
                }
                // `info`, not `debug`: this is the moment the badge moves without the web's knowledge, and
                // `debug` is dropped entirely on release builds — which left the badge-vs-unread
                // reports with no evidence at all on the path that causes them (ADR-0099).
                NativeLogger.log(
                    "info",
                    TAG,
                    "push received (background) — banner shown, badge=$badgeCount, messageId=$messageId, channel=$channelId"
                )
                displayNotification(
                    messageId = messageId,
                    channelId = channelId,
                    title = finalTitle,
                    body = finalBody,
                    clickAction = navClickAction,
                    payload = payload,
                    i18nJson = i18nJson,
                    badgeCount = badgeCount,
                    largeIcon = loadSenderThumbnail(payload)
                )
            }
        }
    }

    /**
     * Merges the [LINK_CONTEXT_KEYS] (cid/sid/chatId) from the push payload into the click-through
     * link's query.
     *
     * Per the push spec, these live inside the `payload` JSON, separate from `link`, while the web
     * reads them from the navigation query: cid/sid to switch session, chatId to open the thread when
     * the chat is a reply (a chat that is not one leaves the reader in the room). Existing query values
     * on the link are never overridden (see [mergeLinkQuery]). Returns the original link untouched on
     * empty input or malformed payload JSON.
     */
    private fun mergeContextIntoLink(clickAction: String, payload: String): String {
        if (clickAction.isEmpty() || payload.isEmpty()) return clickAction
        return try {
            val json = JSONObject(payload)
            val context = LINK_CONTEXT_KEYS.mapNotNull { key ->
                json.optString(key).takeIf { it.isNotEmpty() }?.let { key to it }
            }
            mergeLinkQuery(clickAction, context)
        } catch (e: Exception) {
            NativeLogger.log("error", TAG, "Failed to merge push context into click action: $clickAction", e)
            clickAction
        }
    }

    /**
     * The sender's profile image as a round large icon, or null to show the banner without one.
     *
     * Only an `https://` `thumbnail` in the payload is fetched — anything else (absent, `http://`, a
     * `data:` or `file:` URI) is ignored; the host itself is not restricted. The fetch is synchronous because `onMessageReceived` already runs off the main thread, and it is
     * bounded as a whole by [THUMBNAIL_TIMEOUT_MS] and in size by [PUSH_THUMBNAIL_MAX_BYTES], and its
     * result — a failure included — is reused for the same address for a while. Every
     * failure is the same outcome — no image — because the image must never cost the notification.
     *
     * The address is never logged: a profile image URL can carry user identifiers.
     */
    private fun loadSenderThumbnail(payload: String): Bitmap? {
        val raw = try {
            if (payload.isEmpty()) null else JSONObject(payload).optString("thumbnail")
        } catch (e: Exception) {
            null
        }
        val url = acceptedThumbnailUrl(raw) ?: return null
        thumbnailCache.get(url, SystemClock.elapsedRealtime())?.let { return it.value }

        val icon = fetchRoundIcon(url)
        thumbnailCache.put(url, icon, SystemClock.elapsedRealtime() + THUMBNAIL_CACHE_MS)
        return icon
    }

    /** One fetch and decode of [url], bounded as [loadSenderThumbnail] describes. */
    private fun fetchRoundIcon(url: String): Bitmap? {
        val connectionRef = java.util.concurrent.atomic.AtomicReference<HttpURLConnection?>()
        val task = thumbnailExecutor.submit<ByteArray?> {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = THUMBNAIL_TIMEOUT_MS.toInt()
                readTimeout = THUMBNAIL_TIMEOUT_MS.toInt()
            }
            connectionRef.set(connection)
            try {
                if (connection.responseCode != HttpURLConnection.HTTP_OK) return@submit null
                // A declared length past the cap is refused before a byte is read.
                if (connection.contentLengthLong > PUSH_THUMBNAIL_MAX_BYTES) return@submit null
                connection.inputStream.use { readCapped(it, PUSH_THUMBNAIL_MAX_BYTES) }
            } finally {
                connection.disconnect()
            }
        }
        val bytes = try {
            task.get(THUMBNAIL_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (e: Exception) {
            task.cancel(true)
            connectionRef.get()?.disconnect()
            NativeLogger.log("debug", TAG, "Push thumbnail skipped: ${e.javaClass.simpleName}")
            null
        } ?: return null

        return try {
            decodeRoundIcon(bytes)
        } catch (e: Exception) {
            NativeLogger.log("debug", TAG, "Push thumbnail undecodable: ${e.javaClass.simpleName}")
            null
        }
    }

    /**
     * Decodes [bytes] sampled down toward [THUMBNAIL_EDGE_PX] and draws a centred circle of it into a
     * [THUMBNAIL_EDGE_PX] square — a fixed size, so the icon handed to `notify()` stays small whatever
     * the source was.
     */
    private fun decodeRoundIcon(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val options = BitmapFactory.Options().apply {
            inSampleSize = thumbnailSampleSize(bounds.outWidth, bounds.outHeight, THUMBNAIL_EDGE_PX)
        }
        val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null

        val edge = THUMBNAIL_EDGE_PX.toFloat()
        val scale = edge / minOf(source.width, source.height)
        val round = Bitmap.createBitmap(THUMBNAIL_EDGE_PX, THUMBNAIL_EDGE_PX, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
            shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
                val matrix = android.graphics.Matrix()
                matrix.setScale(scale, scale)
                matrix.postTranslate((edge - source.width * scale) / 2f, (edge - source.height * scale) / 2f)
                setLocalMatrix(matrix)
            }
        }
        Canvas(round).drawCircle(edge / 2f, edge / 2f, edge / 2f, paint)
        source.recycle()
        return round
    }

    /**
     * Tap URI for a push that arrived without a `link`, or "" when the tap should not navigate.
     *
     * Only the types that omit `link` BY CONTRACT get one — the payload spec routes those taps to the
     * root. A chat push missing its link is a malformed payload, not a request to leave the screen the
     * user is on, so it keeps merely foregrounding the app.
     *
     * This is load-bearing on Android specifically: `displayNotification` only sets the intent's data
     * URI when the link is non-empty, and RN's `Linking` surfaces nothing else (the `clickAction`
     * extra is never read). Without a URI here a cloud tap would do nothing at all, while iOS — which
     * routes taps through `resolvePushTapPath` in JS — would go to the root. Keep the rooted-type set
     * in step with ROOTED_PUSH_TYPES there.
     *
     * The scheme comes from the flavor's `app_scheme` string resource (prod `chatic`, dev
     * `chatic-dev`), looked up by name like the launcher icon above so this file stays free of a
     * flavor-specific `R` import. `<scheme>://` resolves to the web root — see the deep link tests.
     */
    private fun rootTapLinkFor(type: String): String {
        if (type != PUSH_TYPE_CLOUD) return ""
        val resId = resources.getIdentifier("app_scheme", "string", packageName)
        if (resId == 0) {
            NativeLogger.log("warn", TAG, "app_scheme string resource missing; cloud tap will not navigate")
            return ""
        }
        return "${getString(resId)}://"
    }

    /** Chat channels contribute to the unread badge; notice/marketing/cloud pushes do not. */
    private fun isChatChannel(channelId: String): Boolean =
        channelId == "dou_chat" || channelId == "dou_chat_muted"

    /** Raw cross-cloud push mark hint (ADR-0056) — fields only, no interpretation of any of them. */
    private data class PushCloudHint(
        val cid: String?,
        val uid: String?,
        val channelId: String?,
        val sid: String?,
        val channelName: String?
    )

    /**
     * Parses the mark hint fields straight off the payload JSON — separate from
     * [mergeContextIntoLink]'s cid/sid extraction because this needs the fuller field set
     * (`uid`/`channelId`/`channelName`) that only cross-cloud mark resolution uses.
     */
    private fun parsePushCloudHint(payload: String): PushCloudHint {
        if (payload.isEmpty()) return PushCloudHint(null, null, null, null, null)
        return try {
            val json = JSONObject(payload)
            PushCloudHint(
                cid = json.optString("cid").takeIf { it.isNotEmpty() },
                uid = json.optString("uid").takeIf { it.isNotEmpty() },
                channelId = json.optString("channelId").takeIf { it.isNotEmpty() },
                sid = json.optString("sid").takeIf { it.isNotEmpty() },
                channelName = json.optString("channelName").takeIf { it.isNotEmpty() }
            )
        } catch (e: Exception) {
            // The payload carries the channel name — content, so the exception stands alone.
            NativeLogger.log("error", TAG, "Failed to parse push cloud hint", e)
            PushCloudHint(null, null, null, null, null)
        }
    }

    /**
     * A language pinned in the app's Settings wins; otherwise the device language, as before. The
     * choice is read from [LanguagePreferenceStore] because this service can run with the app closed.
     */
    private fun resolveLanguage(): String {
        LanguagePreferenceStore.pinnedLanguage(applicationContext)?.let { return it }
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
            NativeLogger.log("error", TAG, "Failed to load locales/$lang.json from assets", e)
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
                NativeLogger.log("error", TAG, "Failed to load locales/en.json from assets", e)
            }
        }

        return if (jsonStr != null) JSONObject(jsonStr) else JSONObject()
    }

    /**
     * [fallbackKey] names the copy to show when the template needs more args than the payload sent;
     * without one the unfilled placeholders are dropped instead (see [formatPushTemplate]).
     */
    private fun translate(i18nJson: JSONObject, key: String, argsJsonStr: String, fallbackKey: String? = null): String {
        if (key.isEmpty()) return ""

        // A key this build does not know stays on the banner as the key itself. That is the visible
        // sign a payload outran the installed app, which the server's rollout order is there to
        // prevent — covering it up here would hide the rollout mistake as well.
        val template = resolveKey(i18nJson, key) ?: return key
        val fallback = fallbackKey?.let { resolveKey(i18nJson, it) }
        return formatPushTemplate(template, parseArgs(argsJsonStr), fallback)
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
            // Loc args are message content (the chat text, the sender's name), and so is the
            // exception's message, which quotes the input — the length and the type are all that go
            // out. The caller then treats the push as having no args.
            NativeLogger.log("error", TAG, "Failed to parse loc args array: len=${jsonArrayStr.length}, ${e.javaClass.simpleName}")
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

    /**
     * Hands a foreground push to the web through React Native.
     *
     * [data] is the FCM payload verbatim; the named parameters above it are the fields this service
     * already resolved (translated title/body, the notification channel, the raw link). Sending the
     * whole map matters because the web suppresses its in-app banner on `ownerId`/`channelId` —
     * fields this handler has no reason to interpret, and which used to be dropped here, so the
     * banner fired for the reader's own message.
     *
     * Note [channelId] is the OS NOTIFICATION channel ("dou_chat"), never the chat channel; it is
     * emitted under its own key so the web cannot mistake one for the other.
     */
    private fun emitForegroundEvent(
        messageId: String,
        type: String,
        title: String,
        body: String,
        clickAction: String,
        channelId: String,
        timestamp: String,
        payload: String,
        data: Map<String, String>
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
                    putMap("data", Arguments.createMap().apply {
                        data.forEach { (key, value) -> putString(key, value) }
                    })
                }

                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onForegroundPushReceived", params)
                NativeLogger.log("debug", TAG, "Successfully emitted foreground push event to React Native.")
            }
        } catch (e: Exception) {
            NativeLogger.log("error", TAG, "Failed to emit foreground push event to React Native", e)
        }
    }

    private fun displayNotification(
        messageId: String,
        channelId: String,
        title: String,
        body: String,
        clickAction: String,
        payload: String,
        i18nJson: JSONObject,
        badgeCount: Int? = null,
        largeIcon: Bitmap? = null
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

        // The sender's face. Title and body stay the plain assembled copy — not MessagingStyle, which
        // would redraw the sender and room its own way and make this banner read differently from the
        // iOS one and the in-app one.
        if (largeIcon != null) {
            notificationBuilder.setLargeIcon(largeIcon)
        }

        // Drive the launcher app-icon badge count where the launcher supports numeric badges.
        // Badge fidelity is launcher-dependent on Android (same limitation as notifee): launchers
        // that only render a dot ignore the number, but the dot still appears from the notification.
        if (badgeCount != null && badgeCount > 0) {
            notificationBuilder.setNumber(badgeCount)
        }

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

/** A positional placeholder in a push template; the digits are the index of the arg it takes. */
private val PUSH_PLACEHOLDER = Regex("""\{(\d+)\}""")

/**
 * Fills a push template's `{n}` placeholders from [args], in order.
 *
 * When the template names a placeholder [args] does not reach — a chat push for a message with no
 * text sends no args for its `{0}` body — the result is not shown as-is: it is [fallback] when there
 * is one, otherwise the template with those placeholders removed and trimmed. So a body falls back
 * to generic copy while a title just loses the part it could not fill.
 *
 * The hole is judged on the template, not on the substituted result, so an arg that itself contains
 * `{0}` (a message quoting code) is still shown verbatim. Top-level rather than a member so it runs
 * under a plain JVM unit test; the same rule lives in the iOS extension and the RN shell.
 */
internal fun formatPushTemplate(template: String, args: List<String>, fallback: String?): String {
    // An index too long for Int is certainly past the args too.
    fun isHole(m: MatchResult) = (m.groupValues[1].toIntOrNull() ?: Int.MAX_VALUE) >= args.size

    val unfilled = PUSH_PLACEHOLDER.findAll(template).any(::isHole)
    if (unfilled && fallback != null) return fallback

    var result = if (unfilled) PUSH_PLACEHOLDER.replace(template) { if (isHole(it)) "" else it.value } else template
    for (i in args.indices) {
        result = result.replace("{$i}", args[i])
    }
    return if (unfilled) result.trim() else result
}

/** Size cap on a push profile image; a bigger one is dropped, not truncated. */
internal const val PUSH_THUMBNAIL_MAX_BYTES = 1_048_576

/**
 * The payload's `thumbnail` if it is an address this service will fetch, else null. Only `https://`
 * qualifies: no plain HTTP, no `file:`, and a `data:` URI (what the server's profile images are today)
 * is not an address at all. The host is not restricted.
 */
internal fun acceptedThumbnailUrl(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    return if (value.startsWith("https://", ignoreCase = true) && value.length > "https://".length) value else null
}

/**
 * Reads [input] to the end, or returns null as soon as it passes [maxBytes] — so an oversized image is
 * never held whole, whatever length the server declared.
 */
internal fun readCapped(input: InputStream, maxBytes: Int): ByteArray? {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    while (true) {
        val read = input.read(buffer)
        if (read < 0) return out.toByteArray()
        if (out.size() + read > maxBytes) return null
        out.write(buffer, 0, read)
    }
}

/**
 * The power-of-two `inSampleSize` that keeps the decoded image's shorter edge at or above [targetEdge],
 * and its longer edge within four times that — so a very wide or tall image is not decoded at full size
 * just because its short edge is already small.
 */
internal fun thumbnailSampleSize(width: Int, height: Int, targetEdge: Int): Int {
    var sample = 1
    while (minOf(width, height) / (sample * 2) >= targetEdge || maxOf(width, height) / sample > targetEdge * 4) {
        sample *= 2
    }
    return sample
}

/**
 * Remembers a fetched profile image — or that the fetch failed — per address until an expiry. A null
 * value is a remembered failure, which is the point: a slow or broken image host is waited on once,
 * not once per message. Bounded by [maxEntries]; the oldest entry goes first.
 */
internal class PushThumbnailCache<T>(private val maxEntries: Int) {
    class Hit<T>(val value: T?)

    private class Entry<T>(val value: T?, val expiresAt: Long)

    private val entries = LinkedHashMap<String, Entry<T>>()

    @Synchronized
    fun get(key: String, now: Long): Hit<T>? {
        val entry = entries[key] ?: return null
        if (now >= entry.expiresAt) {
            entries.remove(key)
            return null
        }
        return Hit(entry.value)
    }

    @Synchronized
    fun put(key: String, value: T?, expiresAt: Long) {
        entries.remove(key)
        entries[key] = Entry(value, expiresAt)
        while (entries.size > maxEntries) entries.remove(entries.keys.first())
    }
}

/**
 * Appends [params] to [link]'s query, skipping any name the query already has, and keeps a `#fragment`
 * last.
 *
 * Built on the string rather than `android.net.Uri`: a link is a relative path such as
 * `/channels/U:1002021/room`, and `Uri.parse` takes everything before the first `:` as a scheme, so a
 * room id containing one made the link an opaque URI whose query cannot be read — the merge threw and
 * the tap lost its context. The JS shell's `resolvePushTapPath` builds the query the same way.
 */
internal fun mergeLinkQuery(link: String, params: List<Pair<String, String>>): String {
    if (params.isEmpty()) return link
    val hashAt = link.indexOf('#')
    val beforeHash = if (hashAt >= 0) link.substring(0, hashAt) else link
    val hash = if (hashAt >= 0) link.substring(hashAt) else ""
    val queryAt = beforeHash.indexOf('?')
    val path = if (queryAt >= 0) beforeHash.substring(0, queryAt) else beforeHash
    val query = if (queryAt >= 0) beforeHash.substring(queryAt + 1) else ""

    val present = query.split('&').filter { it.isNotEmpty() }
        .map { java.net.URLDecoder.decode(it.substringBefore('='), "UTF-8") }
        .toSet()
    val added = params.filter { (name, _) -> name !in present }
        .map { (name, value) -> "$name=${encodeQueryComponent(value)}" }
    if (added.isEmpty()) return link

    val merged = (listOf(query).filter { it.isNotEmpty() } + added).joinToString("&")
    return "$path?$merged$hash"
}

/** `encodeURIComponent`'s encoding: a space is `%20`, not the form encoding's `+`. */
private fun encodeQueryComponent(value: String): String =
    java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20")
