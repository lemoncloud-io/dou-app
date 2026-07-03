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

        // UNUserNotificationCenter 델리게이트 지정
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

        return true
    }

    // MARK: - Background URLSession (업로드)
    /// iOS가 백그라운드 URLSession 완료 후 앱을 깨울 때 호출.
    /// UploadManager에 completionHandler를 전달하여 iOS가 다시 앱을 suspend할 수 있도록 처리.
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        if let uploadManager = RCTBridge.current()?.module(forName: "UploadManager") as? NSObject,
           uploadManager.responds(to: Selector(("handleBackgroundSession:completionHandler:"))) {
            uploadManager.perform(
                Selector(("handleBackgroundSession:completionHandler:")),
                with: identifier,
                with: completionHandler
            )
        } else {
            completionHandler()
        }
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

    // APNs 디바이스 토큰 등록 성공 시
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        RNCPushNotificationIOS.didRegisterForRemoteNotifications(
            withDeviceToken: deviceToken
        )
    }

    // APNs 디바이스 토큰 등록 실패 시
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        RNCPushNotificationIOS.didFailToRegisterForRemoteNotificationsWithError(
            error
        )
    }

    // 백그라운드 및 사일런트 알림 수신 시
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

    // 사용자가 알림을 탭하여 앱에 진입했을 때
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        RNCPushNotificationIOS.didReceive(response)
        completionHandler()
    }

    // 앱이 포그라운드 상태일 때 알림 수신 시
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler:
            @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // RNCPushNotificationIOS에 알림을 전달하여 JS 측이 포그라운드 이벤트를 수신하도록 함
        RNCPushNotificationIOS.didReceiveRemoteNotification(notification.request.content.userInfo)
        
        // 포그라운드이므로 시스템 배너(배너, 사운드, 진동)를 화면에 노출하지 않음
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
