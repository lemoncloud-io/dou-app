package io.chatic.dou.module

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Starts the app's JS context over: the bundle is evaluated again and every JS module begins from
 * nothing, while the process, the native modules and what they keep on disk stay. The app uses it when
 * the in-memory state of a whole JS run has to go — after a session its own runtime held has ended —
 * which no single module can promise to drop by itself.
 *
 * `DevSettings.reload` does the same in a debug build only; a release build's dev support ignores it.
 * The React host's own reload works in every build.
 *
 * It answers before the reload, since the context that asked does not survive it, and answers `false`
 * when there is no host to reload.
 */
class AppRestartModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "AppRestart"
    }

    @ReactMethod
    fun reload(reason: String?, promise: Promise) {
        val host = (reactApplicationContext.applicationContext as? ReactApplication)?.reactHost
        if (host == null) {
            promise.resolve(false)
            return
        }
        promise.resolve(true)
        val why = if (reason.isNullOrEmpty()) "AppRestart" else reason
        // Posted, so the answer above reaches JS before the context goes.
        UiThreadUtil.runOnUiThread { host.reload(why) }
    }
}
