package io.chatic.dou.module

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Relays pure-native (Kotlin) logs into the JS logging core (ADR-0047).
 * Native code calls [NativeLogger.log]; entries queue until JS subscribes and
 * signals [ready], then flow as `ChaticNativeLog` device events — cold-start
 * logs survive instead of being dropped by an emitter with no listeners.
 */
class NativeLoggerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ChaticNativeLogger"

    override fun initialize() {
        super.initialize()
        NativeLogger.attach(reactApplicationContext)
    }

    override fun invalidate() {
        NativeLogger.detach()
        super.invalidate()
    }

    /** JS calls this once its listener is subscribed — flushes the cold-start queue. */
    @ReactMethod
    fun ready() {
        NativeLogger.markReady()
    }

    // NativeEventEmitter on the JS side expects these to exist (no-op on Android).
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit
}

/**
 * Static entry point for native code. Mirrors every call to Logcat, so
 * adopting it never loses the local debugging output.
 */
object NativeLogger {
    private const val EVENT_NAME = "ChaticNativeLog"
    private const val MAX_QUEUE = 200

    private var reactContext: ReactApplicationContext? = null
    private var ready = false
    private val queue = ArrayDeque<WritableMap>()

    @Synchronized
    internal fun attach(context: ReactApplicationContext) {
        reactContext = context
        flushLocked()
    }

    @Synchronized
    internal fun detach() {
        reactContext = null
        ready = false
    }

    @Synchronized
    internal fun markReady() {
        ready = true
        flushLocked()
    }

    @JvmStatic
    @JvmOverloads
    @Synchronized
    fun log(level: String, tag: String, message: String, throwable: Throwable? = null) {
        when (level) {
            "error" -> Log.e(tag, message, throwable)
            "warn" -> Log.w(tag, message, throwable)
            "debug" -> Log.d(tag, message, throwable)
            else -> Log.i(tag, message, throwable)
        }

        val entry = Arguments.createMap().apply {
            putString("level", level)
            putString("tag", tag)
            putString("message", message)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
            throwable?.let { putString("error", Log.getStackTraceString(it)) }
        }

        if (queue.size >= MAX_QUEUE) queue.removeFirst()
        queue.addLast(entry)
        flushLocked()
    }

    private fun flushLocked() {
        val context = reactContext ?: return
        if (!ready || !context.hasActiveReactInstance()) return
        try {
            val emitter = context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            while (queue.isNotEmpty()) {
                emitter.emit(EVENT_NAME, queue.removeFirst())
            }
        } catch (_: Exception) {
            // A log relay must never crash native code; entries stay queued.
        }
    }
}
