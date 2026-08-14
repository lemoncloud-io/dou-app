package io.chatic.dou.module

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.chatic.dou.push.PushMarkStore

/**
 * Drains the cross-cloud push marks a background chat push recorded (ADR-0056) — read and clear
 * in one native call, so a mark reaches the web exactly once. Called on boot (after `WebAppReady`)
 * and on foreground return; see `useFcmHandler`'s `FetchPushMarks` handler on the JS side.
 */
class PushMarksModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "PushMarks"
    }

    @ReactMethod
    fun drain(promise: Promise) {
        try {
            val marks = PushMarkStore.drainAll(reactApplicationContext)
            val result = Arguments.createArray()
            marks.forEach { record ->
                val map = Arguments.createMap()
                record.forEach { (key, value) -> map.putString(key, value) }
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PUSH_MARKS_DRAIN_FAILED", e.message)
        }
    }
}
