package io.chatic.dou

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import io.chatic.dou.bridge.AppIconManagerPackage
import io.chatic.dou.bridge.BackNavigationPackage
import io.chatic.dou.bridge.BadgeSyncPackage
import io.chatic.dou.bridge.BootSplashPackage
import io.chatic.dou.bridge.FileManagerPackage
import io.chatic.dou.bridge.HapticPackage
import io.chatic.dou.bridge.MediaExportPackage
import io.chatic.dou.bridge.NativeLoggerPackage
import io.chatic.dou.bridge.PhotoLibraryPackage
import io.chatic.dou.bridge.PushMarksPackage
import io.chatic.dou.bridge.SharedLanguagePackage
import io.chatic.dou.bridge.SystemBarsPackage
import io.chatic.dou.bridge.TransferManagerPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
            add(AppIconManagerPackage())
            add(BackNavigationPackage())
            add(BadgeSyncPackage())
            add(BootSplashPackage())
            add(FileManagerPackage())
            add(HapticPackage())
            add(MediaExportPackage())
            add(NativeLoggerPackage())
            add(PhotoLibraryPackage())
            add(PushMarksPackage())
            add(SharedLanguagePackage())
            add(SystemBarsPackage())
            add(TransferManagerPackage())
        },
      jsMainModulePath = "src/main",
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
