package io.chatic.dou

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import io.chatic.dou.handler.BackNavigationHandler
import io.chatic.dou.splash.BootSplashState

class MainActivity : ReactActivity() {
    private val backNavigationHandler: BackNavigationHandler by lazy {
        BackNavigationHandler(
            activity = this,
            dispatchReactBackPress = { dispatchReactBackPress() },
            dispatchSystemBackPress = { dispatchSystemBackPress() },
        )
    }

    private val splashHandler = Handler(Looper.getMainLooper())

    // Lets the splash go if the web never reports its first paint (a crashed or hung JS runtime),
    // so the user is never stuck on the logo.
    private val splashSafetyRelease = Runnable { BootSplashState.release() }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The splash is the only thing that shows the logo during boot: it stays up until the web
        // reports its first screen painted (BootSplashModule.hide). Re-armed on every onCreate —
        // see BootSplashState for why the hold is per Activity.
        BootSplashState.arm()
        val splashScreen = installSplashScreen()
        splashScreen.setKeepOnScreenCondition { BootSplashState.isHeld }
        // Deliberately no setOnExitAnimationListener. Setting one makes the system hand its starting
        // window over to this Activity as a copy, and on a busy start that handover times out: the
        // system then removes its splash with its own animation (grey, then black) and the copy
        // appears afterwards — the splash shown twice. Without a listener the system keeps its own
        // splash until the hold is released and removes it with its default fade.
        splashHandler.postDelayed(splashSafetyRelease, SPLASH_SAFETY_CAP_MS)
        super.onCreate(savedInstanceState)
    }

    override fun onDestroy() {
        splashHandler.removeCallbacks(splashSafetyRelease)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        backNavigationHandler.resetExitBackPress()
    }

    override fun onBackPressed() {
        backNavigationHandler.handleBackPressed()
    }

    override fun invokeDefaultOnBackPressed() {
        backNavigationHandler.handleDefaultBackPressed()
    }

    private fun dispatchReactBackPress() {
        super.onBackPressed()
    }

    private fun dispatchSystemBackPress() {
        super.invokeDefaultOnBackPressed()
    }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Chatic"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    private companion object {
        const val SPLASH_SAFETY_CAP_MS = 5000L
    }
}
