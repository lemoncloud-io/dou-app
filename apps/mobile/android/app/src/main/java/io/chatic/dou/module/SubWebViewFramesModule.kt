package io.chatic.dou.module

import androidx.webkit.WebViewFeature
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/**
 * Whether a message a page posts reaches the app under the origin of the frame that posted it.
 *
 * react-native-webview picks its messaging channel by the same check this module answers with. Where
 * the WebView supports web message listeners, each message carries the posting frame's own origin, so
 * the sub WebView's origin check turns away a frame from another site. Where it does not, the library
 * falls back to a JavaScript interface that every frame of the page can call and that reports the
 * top-level page's URL whatever frame called it — a frame from another site then passes the check.
 *
 * The answer is a constant: the WebView provider is fixed for the life of the process (an update of
 * it restarts the app). JS reads it only when a sub WebView opens, by which time the main WebView has
 * loaded the provider, so the check costs nothing then. A WebView that cannot be asked counts as not
 * supporting it: the sub WebView then keeps its runtime requests closed.
 */
class SubWebViewFramesModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SubWebViewFrames"
    }

    override fun getConstants(): Map<String, Any> {
        val supported = try {
            WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        } catch (error: Throwable) {
            false
        }
        return mapOf("reportsFrameOrigin" to supported)
    }
}
