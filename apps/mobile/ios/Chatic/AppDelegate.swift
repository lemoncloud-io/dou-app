import Firebase
import React
import ReactAppDependencyProvider
import React_RCTAppDelegate
import UIKit
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate,
    UNUserNotificationCenterDelegate
{
    var window: UIWindow?

    var reactNativeDelegate: ReactNativeDelegate?
    var reactNativeFactory: RCTReactNativeFactory?

    /// Buffer for Universal Link URL received during cold start.
    static var initialUniversalLink: String?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication
            .LaunchOptionsKey: Any]? = nil
    ) -> Bool {

        FirebaseApp.configure()

        // Reattach to the background transfer session before anything else, so the delegate is in
        // place when iOS delivers results of uploads that finished while the app was not running.
        _ = TransferSessionOwner.shared

        // Assign the UNUserNotificationCenter delegate
        UNUserNotificationCenter.current().delegate = self

        let delegate = ReactNativeDelegate()
        let factory = RCTReactNativeFactory(delegate: delegate)
        delegate.dependencyProvider = RCTAppDependencyProvider()

        reactNativeDelegate = delegate
        reactNativeFactory = factory

        window = UIWindow(frame: UIScreen.main.bounds)

        factory.startReactNative(
            withModuleName: "Chatic",
            in: window,
            launchOptions: launchOptions
        )

        // Hold the launch screen over the app until the web reports its first screen painted — the
        // OS drops its own as soon as RN draws, long before the WebView has content.
        if let window {
            BootSplashOverlay.shared.show(in: window)
        }

        return true
    }

    // MARK: - Background URLSession (file transfer)
    /// Called when iOS wakes the app for the background transfer session. The handler goes to the
    /// transfer owner directly, not through React Native: RN may not be running at all, and calling
    /// the handler before the session has delivered its events would drop the results.
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        TransferSessionOwner.shared.handleBackgroundEvents(
            identifier: identifier,
            completionHandler: completionHandler
        )
    }

    // MARK: - Deep Linking (Custom URL Scheme)
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return RCTLinkingManager.application(app, open: url, options: options)
    }

    // MARK: - Universal Links
    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
            let url = userActivity.webpageURL
        {
            AppDelegate.initialUniversalLink = url.absoluteString
        }
        return RCTLinkingManager.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }

    // MARK: - Badge counter (shared with the Notification Service Extension via App Group)

    /// App Group id shared between the app and the NSE so both read/write the same badge counter.
    /// Must match the `com.apple.security.application-groups` entitlement on both targets.
    private static let appGroupId = "group.io.chatic.dou"
    private static let badgeCountKey = "badge_count"
    /// Whether the app is currently in the foreground. The NSE reads this to avoid double-counting:
    /// while the app is active the web (over the live socket) already owns the badge, so a push that
    /// also runs the NSE must not increment.
    private static let appActiveKey = "app_active"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: AppDelegate.appGroupId)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Clear the visible badge on entry (existing behavior); the web re-aggregates and re-sets the
        // true count shortly after (see the web UnreadBadgeRunner foreground reconcile).
        UIApplication.shared.applicationIconBadgeNumber = 0
        // Mark foreground so the NSE stops incrementing while the socket-driven web owns the badge.
        sharedDefaults?.set(true, forKey: AppDelegate.appActiveKey)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        guard let defaults = sharedDefaults else { return }
        // Handing the badge over to the NSE: capture the current true count (only the app process can
        // read the live icon badge — the NSE cannot) so background pushes increment from truth, and
        // flip the foreground flag off.
        defaults.set(false, forKey: AppDelegate.appActiveKey)
        defaults.set(UIApplication.shared.applicationIconBadgeNumber, forKey: AppDelegate.badgeCountKey)
    }

    // MARK: - Push Notifications (APNs)

    // When APNs device token registration succeeds
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        RNCPushNotificationIOS.didRegisterForRemoteNotifications(
            withDeviceToken: deviceToken
        )
    }

    // When APNs device token registration fails
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        RNCPushNotificationIOS.didFailToRegisterForRemoteNotificationsWithError(
            error
        )
    }

    // When a background or silent notification is received
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler:
            @escaping (UIBackgroundFetchResult) -> Void
    ) {
        RNCPushNotificationIOS.didReceiveRemoteNotification(
            userInfo,
            fetchCompletionHandler: completionHandler
        )
    }

    // When the user taps a notification to enter the app
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        RNCPushNotificationIOS.didReceive(response)
        completionHandler()
    }

    // When a notification is received while the app is in the foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler:
            @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Forward the notification to RNCPushNotificationIOS so the JS side receives the foreground event
        RNCPushNotificationIOS.didReceiveRemoteNotification(notification.request.content.userInfo)

        // Since we're in the foreground, don't show the system banner (banner, sound, vibration)
        completionHandler([])
    }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
    override func sourceURL(for bridge: RCTBridge) -> URL? {
        self.bundleURL()
    }

    override func bundleURL() -> URL? {
        #if DEBUG
            RCTBundleURLProvider.sharedSettings().jsBundleURL(
                forBundleRoot: "src/main"
            )
        #else
            Bundle.main.url(forResource: "main", withExtension: "jsbundle")
        #endif
    }
}
