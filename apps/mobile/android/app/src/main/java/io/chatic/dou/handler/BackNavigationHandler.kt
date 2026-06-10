package io.chatic.dou.handler

import android.app.Activity
import android.widget.Toast
import io.chatic.dou.R
import io.chatic.dou.module.BackNavigationState

class BackNavigationHandler(
    private val activity: Activity,
    private val dispatchReactBackPress: () -> Unit,
    private val dispatchSystemBackPress: () -> Unit,
) {
    private var exitBackPressArmedUntil: Long = 0L

    fun resetExitBackPress() {
        exitBackPressArmedUntil = 0L
    }

    fun handleBackPressed() {
        if (BackNavigationState.canGoBack) {
            dispatchReactBackPress()
            return
        }

        handleExitBackPressed()
    }

    fun handleDefaultBackPressed() {
        handleExitBackPressed()
    }

    private fun handleExitBackPressed() {
        val now = System.currentTimeMillis()
        if (now <= exitBackPressArmedUntil) {
            exitBackPressArmedUntil = 0L
            dispatchSystemBackPress()
            return
        }

        exitBackPressArmedUntil = now + EXIT_BACK_PRESS_INTERVAL_MS
        Toast.makeText(activity, activity.getString(R.string.exit_back_toast), Toast.LENGTH_SHORT).show()
    }

    private companion object {
        private const val EXIT_BACK_PRESS_INTERVAL_MS = 1000L
    }
}
