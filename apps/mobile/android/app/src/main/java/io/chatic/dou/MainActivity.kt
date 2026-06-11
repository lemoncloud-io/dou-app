package io.chatic.dou

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import io.chatic.dou.handler.BackNavigationHandler

class MainActivity : ReactActivity() {
    private val backNavigationHandler: BackNavigationHandler by lazy {
        BackNavigationHandler(
            activity = this,
            dispatchReactBackPress = { dispatchReactBackPress() },
            dispatchSystemBackPress = { dispatchSystemBackPress() },
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
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
}
