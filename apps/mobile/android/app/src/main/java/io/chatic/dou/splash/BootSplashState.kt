package io.chatic.dou.splash

/**
 * Whether the boot splash is still being held, shared between [io.chatic.dou.MainActivity] (which
 * holds it) and [io.chatic.dou.module.BootSplashModule] (through which the web releases it once its
 * first screen is painted).
 *
 * The hold is armed per Activity, not per process. On a warm start the process — and this object —
 * survive while the Activity and its WebView are recreated; a process-wide "already released" would
 * then drop the splash straight onto a blank WebView. The web calls hide again on every load, so
 * re-arming in every `onCreate` costs nothing.
 *
 * Read and written on the main thread only: the SplashScreen keep-on-screen condition is polled
 * there, and the module hops to it before releasing.
 */
object BootSplashState {
    /** True while the splash must stay on screen. Nothing holds it until an Activity arms it. */
    var isHeld: Boolean = false
        private set

    fun arm() {
        isHeld = true
    }

    /** Releases the hold. Returns false when it was already released, so a repeat call is a no-op. */
    fun release(): Boolean {
        if (!isHeld) return false
        isHeld = false
        return true
    }
}
