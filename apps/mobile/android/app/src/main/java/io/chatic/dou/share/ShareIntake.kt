package io.chatic.dou.share

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.IntentCompat
import io.chatic.dou.R
import io.chatic.dou.attach.PickedCopies
import io.chatic.dou.attach.core.AttachPickRules
import io.chatic.dou.attach.core.AttachPickRules.Kind
import io.chatic.dou.share.core.ShareIntakeRules
import java.io.File
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * What another app shares to Dou through the share sheet. [take] turns the `ACTION_SEND(_MULTIPLE)`
 * intent into the URL the app opens on, `<scheme>://share?id=<id>`, and starts copying the shared
 * streams into `attach-pick` at once: the read grant the other app gave belongs to this delivery, and
 * the web asks for the items only once it has loaded. [ShareIntakeModule] answers that request from
 * [pending], waiting for a copy still running.
 *
 * Kept in memory: a share the process did not live to hand over is lost — the app opens as it would. Its
 * copies are left to the `attach-pick` sweep, which runs before the next copy and takes folders
 * untouched for a day.
 */
object ShareIntake {

    private const val TAG = "ShareIntake"

    /** A copied item, answered as a documents pick's file is. */
    data class Kept(val file: File, val name: String, val mimeType: String?, val size: Long)

    /** A shared item not copied, with the kind whose limit the web names for it. */
    data class Refusal(val name: String, val kind: Kind, val reason: String)

    data class Received(val items: List<Kept>, val refused: List<Refusal>, val text: String?) {
        /** Every copy's own folder, one per item as a pick's. */
        val folders: List<File> get() = items.mapNotNull { it.file.parentFile }
    }

    private val pending = ConcurrentHashMap<String, CompletableFuture<Received>>()

    // One share is copied at a time, in share order; two shares in a row queue rather than compete for
    // the disk.
    private val copier: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "share-intake").apply { isDaemon = true }
    }

    /**
     * The intent the screen should go on with instead of a share: a `VIEW` of the share URL, which the
     * deep-link pipeline hands the web as `/share?id=<id>`. Null when [intent] is not a share to take —
     * then the screen keeps the intent it was given.
     */
    fun take(context: Context, intent: Intent?, restored: Boolean): Intent? {
        if (intent == null) return null
        val fromHistory = intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
        if (!ShareIntakeRules.isShare(intent.action, fromHistory, restored)) return null
        // The screen is exported: any app can send it a malformed intent, and this runs before the
        // screen exists. A share that cannot be read leaves the app opening as it would.
        return try {
            val streams = streamsOf(intent)
            val grantsRead = intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0
            val clip = intent.clipData
            val granted = if (clip == null) emptySet() else (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri?.toString() }.toSet()
            val text = ShareIntakeRules.sharedText(intent.getCharSequenceExtra(Intent.EXTRA_TEXT))
            if (streams.isEmpty() && text == null) {
                Log.w(TAG, "a share with no stream and no text")
                return null
            }
            val id = UUID.randomUUID().toString()
            val view = Intent(Intent.ACTION_VIEW, Uri.parse(ShareIntakeRules.shareUrl(context.getString(R.string.app_scheme), id)))
            val appContext = context.applicationContext
            // Registered last, so nothing is copied for a share the screen never opens on.
            pending[id] = CompletableFuture.supplyAsync({ copyAll(appContext, streams, text) { ShareIntakeRules.isGranted(it.toString(), grantsRead, granted) } }, copier)
            Log.i(TAG, "share taken: ${streams.size} stream(s), text: ${text != null}")
            view
        } catch (e: Exception) {
            Log.w(TAG, "the share could not be read: ${e.javaClass.simpleName}")
            null
        }
    }

    /** The share's copy, done or running; null for an id this process does not hold. */
    fun pending(id: String): CompletableFuture<Received>? = pending[id]

    /**
     * Forgets a share. With [discard] its copies are deleted once the copy is done — a copy still running
     * would otherwise write after the delete. A copy that failed kept nothing to delete: each item's
     * folder goes with its own failure.
     */
    fun release(id: String, discard: Boolean) {
        val copy = pending.remove(id) ?: return
        if (!discard) return
        copy.whenComplete { received, _ ->
            val left = received?.folders.orEmpty().count { !it.deleteRecursively() }
            if (left > 0) Log.w(TAG, "$left discarded share folder(s) could not be deleted; the sweep takes them")
        }
    }

    private fun streamsOf(intent: Intent): List<Uri> = when (intent.action) {
        ShareIntakeRules.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
        ShareIntakeRules.ACTION_SEND_MULTIPLE ->
            IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty().filterNotNull()
        else -> emptyList()
    }

    private fun copyAll(context: Context, streams: List<Uri>, text: String?, isGranted: (Uri) -> Boolean): Received {
        val copies = PickedCopies(context)
        // Every writer of `attach-pick` sweeps before it copies.
        copies.sweep()
        val own = ownAuthorities(context)
        val sharedAtMs = System.currentTimeMillis()
        val split = ShareIntakeRules.split(streams)
        val items = mutableListOf<Kept>()
        val refused = mutableListOf<Refusal>()
        for (uri in split.copied) {
            // Without the list of this app's providers no stream can be told safe, so none is taken.
            if (own == null) {
                refused += Refusal(fallbackName(uri), Kind.FILE, "unreadable")
                continue
            }
            if (!isGranted(uri)) {
                Log.w(TAG, "stream refused: the sender did not grant read access")
                refused += Refusal(fallbackName(uri), Kind.FILE, "unsupported")
                continue
            }
            when (val check = ShareIntakeRules.checkStream(uri.scheme, uri.authority, own)) {
                is ShareIntakeRules.StreamCheck.Refused -> {
                    Log.w(TAG, "stream refused: ${check.reason}")
                    refused += Refusal(fallbackName(uri), Kind.FILE, "unsupported")
                }
                ShareIntakeRules.StreamCheck.Accepted -> try {
                    copyOne(context, copies, uri, sharedAtMs, items, refused)
                } catch (e: Exception) {
                    // Failed before a folder was made: naming it, or asking its provider about it.
                    Log.w(TAG, "a shared item could not be read: ${e.javaClass.simpleName}")
                    refused += Refusal(fallbackName(uri), Kind.FILE, "unreadable")
                }
            }
        }
        // Past one message's worth; named so the person sees what was left out.
        for (uri in split.over) refused += Refusal(fallbackName(uri), Kind.FILE, "unsupported")
        Log.i(TAG, "share copied: ${items.size} kept, ${refused.size} refused")
        return Received(items, refused, text)
    }

    private fun copyOne(context: Context, copies: PickedCopies, uri: Uri, sharedAtMs: Long, items: MutableList<Kept>, refused: MutableList<Refusal>) {
        val described = copies.describe(uri)
        val mimeType = try {
            context.contentResolver.getType(uri)
        } catch (e: Exception) {
            null
        }
        val safe = AttachPickRules.safeName(described.displayName, fallbackName(uri))
        val limitKind = AttachPickRules.limitKindForDocument(mimeType, safe)
        // A name made of a media id says nothing; a photo or video gets one from when it was taken.
        val name = if (limitKind == Kind.FILE) safe else AttachPickRules.pickedName(safe, limitKind, described.takenAtMs, sharedAtMs, TimeZone.getDefault())
        val folder = copies.newFolder()
        // One item that fails in an unexpected way is refused, as the picker refuses it; the share and
        // the items already kept go on. Whatever was written for it goes too.
        try {
            when (val copied = copies.copy(uri, folder, name, described.size, ShareIntakeRules.limitFor(mimeType, name))) {
                is PickedCopies.Copied.Kept -> items += Kept(copied.file, name, mimeType, copied.size)
                PickedCopies.Copied.TooLarge -> refused += Refusal(name, limitKind, "too-large")
                PickedCopies.Copied.Unreadable -> refused += Refusal(name, Kind.FILE, "unreadable")
            }
        } catch (e: OutOfMemoryError) {
            Log.w(TAG, "a shared item ran out of memory")
            folder.deleteRecursively()
            refused += Refusal(name, limitKind, "too-large")
        } catch (e: Exception) {
            Log.w(TAG, "a shared item failed: ${e.javaClass.simpleName}")
            folder.deleteRecursively()
            refused += Refusal(name, Kind.FILE, "unreadable")
        }
    }

    /** A name for an item the provider was not asked about: the URI's last segment, or `file`. */
    private fun fallbackName(uri: Uri): String = AttachPickRules.safeName(uri.lastPathSegment, "file")

    /** This app's provider authorities; null when the system would not say, and then nothing is taken. */
    private fun ownAuthorities(context: Context): Set<String>? {
        val manager = context.packageManager
        val flags = PackageManager.GET_PROVIDERS or PackageManager.MATCH_DISABLED_COMPONENTS
        return try {
            val info = if (Build.VERSION.SDK_INT >= 33) {
                manager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
            } else {
                @Suppress("DEPRECATION")
                manager.getPackageInfo(context.packageName, flags)
            }
            ShareIntakeRules.ownAuthorities(info.providers?.map { it.authority }.orEmpty())
        } catch (e: Exception) {
            Log.w(TAG, "this app's providers could not be listed: ${e.javaClass.simpleName}")
            null
        }
    }
}
