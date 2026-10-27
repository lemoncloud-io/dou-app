package io.chatic.dou.share.core

import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.attach.core.AttachPickRules.Kind

/**
 * The rules of the share intake that need no Android framework: which shared stream is taken, what an
 * intake id looks like, the URL the app is opened on, how many items are copied and the limit each is
 * held to. Kept apart so plain JVM tests cover them; the intent, the copies and the pending shares live
 * in [io.chatic.dou.share.ShareIntake].
 */
object ShareIntakeRules {

    /**
     * How many items one share copies — what one message takes. The web would send no more, so copying
     * the rest would only fill the cache; they are reported as not copied instead.
     */
    const val ITEM_MAX = 10

    /**
     * The web's ceilings (`CHAT_ATTACHMENT_MAX_BYTES`). A share is copied before the web is asked, so
     * the ceilings are not handed over with a request as a pick's are.
     */
    const val IMAGE_MAX_BYTES = 20L * 1024 * 1024
    const val VIDEO_MAX_BYTES = AttachPickRules.VIDEO_MAX_BYTES
    const val FILE_MAX_BYTES = 50L * 1024 * 1024

    const val ACTION_SEND = "android.intent.action.SEND"
    const val ACTION_SEND_MULTIPLE = "android.intent.action.SEND_MULTIPLE"

    /**
     * Whether an intent is a share to take. The system hands the screen its first intent again when the
     * app is reopened from Recents or the screen is restored after the process died; taking that one
     * again would copy the share a second time — with a read grant that may have lapsed — and open the
     * share page over whatever the person was doing.
     */
    fun isShare(action: String?, launchedFromHistory: Boolean, restored: Boolean): Boolean =
        (action == ACTION_SEND || action == ACTION_SEND_MULTIPLE) && !launchedFromHistory && !restored

    /** What [checkStream] found. */
    sealed class StreamCheck {
        object Accepted : StreamCheck()
        data class Refused(val reason: String) : StreamCheck()
    }

    /**
     * Whether a shared stream is copied: only a `content://` URI of another app's provider. The share
     * filter is exported, so any app can send this screen an intent; a `file://` path, or a
     * `content://` URI of this app's own providers, would have the app copy its own private files and
     * upload them. The provider is judged without a `<userId>@` prefix, which the resolver drops before
     * it finds the provider — `0@<own authority>` is still this app's own.
     */
    fun checkStream(scheme: String?, authority: String?, ownAuthorities: Set<String>): StreamCheck {
        if (!scheme.equals("content", ignoreCase = true)) return StreamCheck.Refused("only content:// streams are taken")
        val owner = authority?.substringAfterLast('@')?.trim()?.lowercase().orEmpty()
        if (owner.isEmpty()) return StreamCheck.Refused("the stream names no provider")
        if (owner in ownAuthorities) return StreamCheck.Refused("the stream is this app's own")
        return StreamCheck.Accepted
    }

    /**
     * Whether the sender granted read access to [uri]: the intent carries `FLAG_GRANT_READ_URI_PERMISSION`
     * and [uri] is among the URIs that grant covers (the intent's `ClipData`). The system refuses to
     * deliver a grant the sender could not give, so a stream that passes was readable by the sender.
     * Without it this app would read the stream with its own permissions — contacts or photos another
     * app cannot read — and put it in front of the person to send. A normal share always passes: the
     * system copies `EXTRA_STREAM` into `ClipData` and adds the flag when the sender starts the share.
     */
    fun isGranted(uri: String, grantsRead: Boolean, granted: Set<String>): Boolean = grantsRead && uri in granted

    /** This app's provider authorities, from the manifest's `;`-separated lists, lower-cased. */
    fun ownAuthorities(declared: List<String?>): Set<String> =
        declared.flatMap { it.orEmpty().split(';') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()

    private val INTAKE_ID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    /** Whether [id] is one the intake makes, a UUID — the only shape a request may name. */
    fun isIntakeId(id: String?): Boolean = id != null && INTAKE_ID.matches(id)

    /** The URL the app is opened on; the deep-link pipeline turns it into the web's `/share?id=`. */
    fun shareUrl(scheme: String, id: String): String = "$scheme://share?id=$id"

    /** A share's streams split into the ones copied and the ones past [ITEM_MAX]. */
    data class Split<T>(val copied: List<T>, val over: List<T>)

    fun <T> split(streams: List<T>): Split<T> = Split(streams.take(ITEM_MAX), streams.drop(ITEM_MAX))

    /**
     * The limit an item is held to. A shared item is reported as a file, as a documents pick is, and the
     * web sends a photo or an MP4 among them as a photo or a video — so its format picks the ceiling.
     */
    fun limitFor(mimeType: String?, name: String?): Long = when (AttachPickRules.limitKindForDocument(mimeType, name)) {
        Kind.IMAGE -> IMAGE_MAX_BYTES
        Kind.VIDEO -> VIDEO_MAX_BYTES
        Kind.FILE -> FILE_MAX_BYTES
    }

    /** The text shared with or instead of the items; none when it is blank. */
    fun sharedText(text: CharSequence?): String? = text?.toString()?.trim()?.takeIf { it.isNotEmpty() }
}
