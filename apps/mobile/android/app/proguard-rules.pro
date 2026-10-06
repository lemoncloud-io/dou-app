# Project-specific R8 rules, appended to the default proguard-android.txt.
#
# React Native core and most libraries ship their own consumer rules inside their AARs — every
# class implementing NativeModule (this app's io.chatic.dou.module.* included) is already kept by
# react-android, and the default file already keeps @JavascriptInterface methods. Only what nothing
# else covers belongs here: code reached by name at runtime.

# react-native-config hands JS its env values through reflection: Class.forName("<package>.BuildConfig")
# followed by getDeclaredFields(). Unkept, R8 inlines the constants and drops the fields, so the JS
# `Config` object comes back empty in release builds only.
#
# Narrowing this to the keys JS reads would not keep any other key out of the APK: react-native-config
# also writes every key as a string resource, which R8 does not touch.
-keep class io.chatic.dou.BuildConfig { *; }

# react-native-device-info ships no consumer rules and reaches two Play libraries by name. The
# install referrer lookup runs on every launch; renamed, it fails with NoSuchMethodException.
-keep class com.android.installreferrer.api.** { *; }
-keep class com.google.android.gms.common.GoogleApiAvailability {
    public static com.google.android.gms.common.GoogleApiAvailability getInstance();
    public int isGooglePlayServicesAvailable(android.content.Context);
}

# react-native-svg applies the pointerEvents prop by looking this method up on its superclass.
-keepclassmembers class com.facebook.react.views.view.ReactViewGroup {
    void setPointerEvents(com.facebook.react.uimanager.PointerEvents);
}

# Keep file and line numbers so Crashlytics can map obfuscated stacks back to source lines.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
