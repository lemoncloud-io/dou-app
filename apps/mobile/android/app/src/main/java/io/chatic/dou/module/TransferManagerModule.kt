package io.chatic.dou.module

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.chatic.dou.service.TransferService
import io.chatic.dou.transfer.TransferRegistry
import io.chatic.dou.transfer.core.TransferErrorCode
import io.chatic.dou.transfer.core.TransferRejectedException
import io.chatic.dou.transfer.core.TransferRequest
import io.chatic.dou.transfer.core.TransferSnapshot

/**
 * TransferManager — the React Native face of the native file-transfer module.
 *
 * Deliberately thin: it converts bridge values, forwards calls to [TransferRegistry], and relays the
 * registry's state events to JS. It holds no state of its own, so a React instance that is torn
 * down and recreated loses nothing — whatever ended meanwhile is still in the registry for `list`.
 */
class TransferManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "TransferManager"
        const val STATE_EVENT = "TransferManagerStateChanged"
    }

    private val listener = TransferRegistry.Listener { snapshot -> emit(snapshot) }

    override fun getName(): String = "TransferManager"

    override fun initialize() {
        super.initialize()
        TransferRegistry.addListener(listener)
    }

    override fun invalidate() {
        TransferRegistry.removeListener(listener)
        super.invalidate()
    }

    // Required by NativeEventEmitter; the registry listener is registered for the module's lifetime.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun start(request: ReadableMap, promise: Promise) {
        val parsed = try {
            parseRequest(request)
        } catch (e: Exception) {
            promise.reject(TransferErrorCode.INVALID.name, "the request could not be read")
            return
        }
        val accepted = try {
            TransferRegistry.start(parsed)
        } catch (e: TransferRejectedException) {
            promise.reject(e.code.name, e.message)
            return
        } catch (e: Exception) {
            promise.reject(TransferErrorCode.INTERNAL.name, e.message)
            return
        }
        try {
            TransferService.startTransfer(reactApplicationContext, accepted.transferId)
        } catch (e: Exception) {
            // Android 12+ refuses to start a foreground service from the background. The transfer
            // was already accepted, so it ends like any other: as a terminal event the web reads.
            Log.w(TAG, "could not start the transfer service for ${accepted.transferId}", e)
            TransferRegistry.failure(
                accepted.transferId,
                TransferErrorCode.SYSTEM,
                "the background transfer service could not start: ${e.javaClass.simpleName}",
            )
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun cancel(transferId: String, promise: Promise) {
        try {
            // The service sees the terminal event and tears the connection down.
            TransferRegistry.cancel(transferId)
            promise.resolve(null)
        } catch (e: TransferRejectedException) {
            promise.reject(e.code.name, e.message)
        } catch (e: Exception) {
            promise.reject(TransferErrorCode.INTERNAL.name, e.message)
        }
    }

    @ReactMethod
    fun list(promise: Promise) {
        try {
            val array = Arguments.createArray()
            TransferRegistry.list().forEach { array.pushMap(toMap(it)) }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject(TransferErrorCode.INTERNAL.name, e.message)
        }
    }

    @ReactMethod
    fun ack(transferIds: ReadableArray, promise: Promise) {
        try {
            val ids = (0 until transferIds.size())
                .filter { transferIds.getType(it) == ReadableType.String }
                .mapNotNull { transferIds.getString(it) }
            promise.resolve(TransferRegistry.ack(ids))
        } catch (e: Exception) {
            promise.reject(TransferErrorCode.INTERNAL.name, e.message)
        }
    }

    private fun emit(snapshot: TransferSnapshot) {
        val context = reactApplicationContext
        if (!context.hasActiveReactInstance()) return
        try {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(STATE_EVENT, toMap(snapshot))
        } catch (e: Exception) {
            // Best effort: a missed event is recovered through `list`, which is why results are kept.
            Log.w(TAG, "could not emit state for ${snapshot.transferId}", e)
        }
    }

    private fun toMap(snapshot: TransferSnapshot): WritableMap = Arguments.createMap().apply {
        putString("transferId", snapshot.transferId)
        putString("direction", snapshot.direction.wire)
        putString("state", snapshot.state.wire)
        putDouble("transferredBytes", snapshot.transferredBytes.toDouble())
        putDouble("totalBytes", snapshot.totalBytes.toDouble())
        snapshot.httpStatus?.let { putInt("httpStatus", it) }
        snapshot.providerCode?.let { putString("providerCode", it) }
        snapshot.errorCode?.let { putString("errorCode", it.name) }
        snapshot.errorMessage?.let { putString("errorMessage", it) }
        snapshot.file?.let { file ->
            putMap(
                "file",
                Arguments.createMap().apply {
                    putString("uri", file.uri)
                    putDouble("size", file.size.toDouble())
                    file.contentType?.let { putString("contentType", it) }
                },
            )
        }
    }

    /** Reads only what the core validates; a wrongly typed field becomes null and is refused there. */
    private fun parseRequest(map: ReadableMap): TransferRequest {
        val file = map.optMap("file")
        val headers = LinkedHashMap<String, String>()
        map.optMap("headers")?.let { headerMap ->
            val iterator = headerMap.keySetIterator()
            while (iterator.hasNextKey()) {
                val key = iterator.nextKey()
                headerMap.optString(key)?.let { headers[key] = it }
            }
        }
        return TransferRequest(
            transferId = map.optString("transferId"),
            direction = map.optString("direction"),
            url = map.optString("url"),
            method = map.optString("method"),
            headers = headers,
            fileUri = file?.optString("uri"),
            contentType = file?.optString("contentType"),
            contentLength = file?.optNumber("contentLength"),
            title = map.optString("title"),
            fileName = file?.optString("name"),
        )
    }

    private fun ReadableMap.optString(key: String): String? =
        if (hasKey(key) && getType(key) == ReadableType.String) getString(key) else null

    private fun ReadableMap.optNumber(key: String): Double? =
        if (hasKey(key) && getType(key) == ReadableType.Number) getDouble(key) else null

    private fun ReadableMap.optMap(key: String): ReadableMap? =
        if (hasKey(key) && getType(key) == ReadableType.Map) getMap(key) else null
}
