package io.chatic.dou.module

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.chatic.dou.attach.PickedCopies
import io.chatic.dou.attach.core.AttachPickRules.Kind
import io.chatic.dou.share.ShareIntake
import io.chatic.dou.share.core.ShareIntakeRules
import java.util.concurrent.CompletionException

/**
 * `ShareIntake` for the web: a share's items by the id its URL carried ([fetch]), and forgetting it
 * ([release]). The share itself is taken by the screen ([ShareIntake.take]) before the web exists.
 *
 * Items are answered as the documents picker answers a pick — a `file` copied into `attach-pick` —
 * so the web sends them the same way. Errors: `INVALID` for an id the intake does not make, `GONE`
 * for one this process does not hold, `INTERNAL` when the copy itself failed.
 */
class ShareIntakeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ShareIntake"
    }

    private val copies = PickedCopies(reactContext)

    override fun getName(): String = "ShareIntake"

    /** Answers once the share's copy is done; a copy still running is waited for, not polled. */
    @ReactMethod
    fun fetch(id: String?, promise: Promise) {
        if (id == null || !ShareIntakeRules.isIntakeId(id)) {
            promise.reject("INVALID", "id must be a share id")
            return
        }
        val copy = ShareIntake.pending(id)
        if (copy == null) {
            promise.reject("GONE", "no such share")
            return
        }
        copy.whenComplete { received, error ->
            // Settled here or nowhere: an exception out of this callback only fails a future no one reads.
            try {
                if (error != null || received == null) {
                    val cause = (error as? CompletionException)?.cause ?: error
                    Log.w(TAG, "the share's copy failed: ${cause?.javaClass?.simpleName}")
                    promise.reject("INTERNAL", "the shared items could not be copied", cause)
                    return@whenComplete
                }
                promise.resolve(answer(received))
            } catch (e: Exception) {
                Log.w(TAG, "the share could not be answered: ${e.javaClass.simpleName}")
                promise.reject("INTERNAL", "the shared items could not be answered", e)
            }
        }
    }

    @ReactMethod
    fun release(id: String?, discard: Boolean, promise: Promise) {
        if (id == null || !ShareIntakeRules.isIntakeId(id)) {
            promise.reject("INVALID", "id must be a share id")
            return
        }
        ShareIntake.release(id, discard)
        promise.resolve(null)
    }

    private fun answer(received: ShareIntake.Received) = Arguments.createMap().apply {
        val items = Arguments.createArray()
        for (item in received.items) items.pushMap(copies.keptItem(Kind.FILE, item.file, item.name, item.mimeType, item.size))
        val refused = Arguments.createArray()
        for (refusal in received.refused) {
            refused.pushMap(Arguments.createMap().apply {
                putString("name", refusal.name)
                putString("kind", refusal.kind.wire)
                putString("reason", refusal.reason)
            })
        }
        putArray("items", items)
        putArray("refused", refused)
        received.text?.let { putString("text", it) }
    }
}
