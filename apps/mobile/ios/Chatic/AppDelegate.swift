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
    /// The scene's window, set by `SceneDelegate`. Several pods still reach the root view through
    /// `UIApplication.shared.delegate.window`, so it has to stay populated under the scene life cycle.
    var window: UIWindow?

    var reactNativeDelegate: ReactNativeDelegate?
    var reactNativeFactory: RCTReactNativeFactory?

    /// Kept for `SceneDelegate`, which starts React Native once the window scene connects.
    private var appLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?

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
        appLaunchOptions = launchOptions

        return true
    }

    /// The launch options React Native reads at cold start, rebuilt for the scene life cycle.
    ///
    /// Under scenes UIKit no longer puts the URL or the universal link that launched the app into
    /// `didFinishLaunching`'s options — they arrive in the scene's connection options instead. React
    /// Native's `Linking.getInitialURL` and `PushNotificationIOS.getInitialNotification` still read
    /// the old keys, so they are copied back here.
    func launchOptions(
        merging connectionOptions: UIScene.ConnectionOptions
    ) -> [UIApplication.LaunchOptionsKey: Any]? {
        var options = appLaunchOptions ?? [:]
        if let url = connectionOptions.urlContexts.first?.url {
            options[.url] = url
        }
        if let activity = connectionOptions.userActivities.first(where: {
            $0.activityType == NSUserActivityTypeBrowsingWeb
        }) {
            options[.userActivityDictionary] = [
                UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
                "UIApplicationLaunchOptionsUserActivityKey": activity,
            ]
        }
        if options[.remoteNotification] == nil,
            let response = connectionOptions.notificationResponse,
            response.notification.request.trigger is UNPushNotificationTrigger
        {
            options[.remoteNotification] = response.notification.request.content.userInfo
        }
        return options.isEmpty ? nil : options
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

    // MARK: - Universal Links
    /// Buffers a universal link for `InitialUrlModule`, the cold-start fallback when React Native's
    /// own initial URL comes back empty. Called by `SceneDelegate` for both cold and warm starts.
    static func bufferUniversalLink(_ userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
            let url = userActivity.webpageURL
        {
            initialUniversalLink = url.absoluteString
        }
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

    /// Called by `SceneDelegate` when the scene becomes active.
    func didBecomeActive() {
        // Clear the visible badge on entry (existing behavior); the web re-aggregates and re-sets the
        // true count shortly after (see the web UnreadBadgeRunner foreground reconcile).
        UIApplication.shared.applicationIconBadgeNumber = 0
        // Mark foreground so the NSE stops incrementing while the socket-driven web owns the badge.
        sharedDefaults?.set(true, forKey: AppDelegate.appActiveKey)
    }

    /// Called by `SceneDelegate` when the scene is about to stop being active.
    func willResignActive() {
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

/// Owns the app's one window. Apps built with the iOS 27.1 SDK must use the scene life cycle — without
/// it the app is terminated at launch — and a window scene is also what follows the display when
/// iPhone Duo opens or closes, where `UIScreen.main` would keep one fixed size. Under scenes UIKit
/// stops calling the app delegate's URL, universal-link and active/resign callbacks, so they arrive
/// here and are forwarded to the same places as before.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var appDelegate: AppDelegate? {
        UIApplication.shared.delegate as? AppDelegate
    }

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene,
            let appDelegate,
            let factory = appDelegate.reactNativeFactory
        else {
            // Only reachable if launch order or the scene manifest is broken. Carrying on would leave a
            // black screen with nothing in the logs; a crash at least reaches Crashlytics.
            fatalError("SceneDelegate connected without a window scene or the React Native factory")
        }

        let window = UIWindow(windowScene: windowScene)
        self.window = window
        let previousWindow = appDelegate.window
        appDelegate.window = window

        // The system may disconnect a backgrounded scene and connect a new one later while the
        // process — and React Native with it — keeps running. Starting React Native again would
        // mount the app a second time on the same JS runtime, so the running root moves over instead.
        // A link that brought the scene back sits only in the connection options — UIKit does not
        // repeat it through the warm-start callbacks — so it is replayed through them here.
        if let root = previousWindow?.rootViewController {
            previousWindow?.rootViewController = nil
            window.rootViewController = root
            window.makeKeyAndVisible()
            self.scene(scene, openURLContexts: connectionOptions.urlContexts)
            connectionOptions.userActivities.forEach { self.scene(scene, continue: $0) }
            return
        }

        // A cold-start universal link arrives here, not through `scene(_:continue:)`.
        connectionOptions.userActivities.forEach(AppDelegate.bufferUniversalLink)

        factory.startReactNative(
            withModuleName: "Chatic",
            in: window,
            launchOptions: appDelegate.launchOptions(merging: connectionOptions)
        )

        // Hold the launch screen over the app until the web reports its first screen painted — the
        // OS drops its own as soon as RN draws, long before the WebView has content.
        BootSplashOverlay.shared.show(in: window)
    }

    // MARK: - Deep Linking (Custom URL Scheme)
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    // MARK: - Universal Links
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        AppDelegate.bufferUniversalLink(userActivity)
        _ = RCTLinkingManager.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    // MARK: - Foreground (badge hand-over)
    func sceneDidBecomeActive(_ scene: UIScene) {
        appDelegate?.didBecomeActive()
    }

    func sceneWillResignActive(_ scene: UIScene) {
        appDelegate?.willResignActive()
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
