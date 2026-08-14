import { webClient } from '@chatic/bridges';
import type {
    OnFetchPushMarksPayload,
    OnWebAppReadyPayload,
    PushCloudMarkRecord,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
} from '@chatic/app-messages';

/**
 * Centralized outbound bridge API (Web -> Native).
 *
 * Every `webClient.post(...)` call that was previously scattered across features
 * lives here as a single semantic method. Call sites should never construct the
 * `{ type, data }` message literal themselves — this keeps message-type strings
 * and payload shapes in one place and decouples features from the raw bridge.
 *
 * Inbound subscription (App -> Web) stays in `useHandleAppMessage`.
 */

/** Convenience alias for a given message type's `data` payload. */
type Payload<K extends WebMessageType> = WebMessageData<K>['data'];

export const appBridge = {
    // ---------------------------------------------------------------
    // System & navigation
    // ---------------------------------------------------------------

    /**
     * Notify the native shell that the web app has mounted and is ready, and return what it
     * answers about itself.
     *
     * `request`, not `post`, because the reply is the capability handshake: it reports what the
     * INSTALLED app can do, which a web build deployed ahead of that app cannot assume (see
     * `setNativeCacheSupport` at the call site in main.tsx). Never rejects — a plain browser has no
     * native bridge, which is not an error condition here, and resolves `null` instead.
     */
    notifyWebAppReady(): Promise<OnWebAppReadyPayload | null> {
        return webClient
            .request({ type: 'WebAppReady', data: {} })
            .then(response => (response?.data as OnWebAppReadyPayload | undefined) ?? null)
            .catch(() => null);
    },

    /** Ask native to dismiss the resume/cold-start overlay. */
    dismissResumeOverlay(): void {
        webClient.post({ type: 'DismissResumeOverlay', data: {} });
    },

    /** Open an external URL in the native browser. */
    openURL(url: string): void {
        webClient.post({ type: 'OpenURL', data: { url } });
    },

    /** Open the native OS app-settings screen. */
    openSettings(): void {
        webClient.post({ type: 'OpenSettings', data: {} });
    },

    /** Open the native share sheet for the given URL. */
    openShareSheet(url: string): void {
        webClient.post({ type: 'OpenShareSheet', data: { url } });
    },

    /** Open the platform subscription-management screen. */
    openSubscriptionManagement(): void {
        webClient.post({ type: 'OpenSubscriptionManagement', data: {} });
    },

    copyClipBoard(text: string) {
        return webClient.request({ type: 'CopyToClipboard', data: { text } });
    },

    /** Deliver the web-side boot timeline snapshot (fire-and-forget, once per load). */
    sendBootMetrics(data: Payload<'SendBootMetrics'>): void {
        webClient.post({ type: 'SendBootMetrics', data });
    },

    /** Propagate the debug-mode unlock/lock to the native shell. */
    setDebugMode(enabled: boolean): void {
        webClient.post({ type: 'SetDebugMode', data: { enabled } });
    },

    // ---------------------------------------------------------------
    // App update
    // ---------------------------------------------------------------

    /** Ask native to check the current app version against the live store version. */
    checkAppUpdate(): Promise<WebMessageResponse<'CheckAppUpdate'>> {
        return webClient.request({ type: 'CheckAppUpdate', data: {} });
    },

    /** Open the platform app store listing. */
    openStore(): void {
        webClient.post({ type: 'OpenStore', data: {} });
    },

    // ---------------------------------------------------------------
    // Notification & device
    // ---------------------------------------------------------------

    /** Request the current FCM device token from native. */
    fetchFcmToken(): Promise<WebMessageResponse<'FetchFcmToken'>> {
        return webClient.request({ type: 'FetchFcmToken', data: {} });
    },

    /** Set the app icon badge count. */
    setBadgeCount(count: number): void {
        webClient.post({ type: 'SetBadgeCount', data: { count } });
    },

    /**
     * Drains the cross-cloud push marks recorded natively for a background chat push (ADR-0056) —
     * read + clear in one native call, so a mark is delivered exactly once. Resolves `[]` on a
     * plain browser (no native bridge) or a shell build that predates this bridge message.
     */
    fetchPushMarks(): Promise<PushCloudMarkRecord[]> {
        return webClient
            .request({ type: 'FetchPushMarks', data: {} })
            .then(response => (response?.data as OnFetchPushMarksPayload | undefined)?.marks ?? [])
            .catch(() => []);
    },

    // ---------------------------------------------------------------
    // Preference & back handling
    // ---------------------------------------------------------------

    /** Persist a preference key/value in native storage. */
    savePreference(data: Payload<'SavePreference'>): void {
        webClient.post({ type: 'SavePreference', data });
    },

    /**
     * Persist a preference and wait for the native confirmation. Rejects on a `success: false`
     * response and on timeout, so the caller can retry — see usePreferenceStore's theme sync,
     * where a silently dropped write leaves the native status bar disagreeing with the page.
     */
    savePreferenceConfirmed(data: Payload<'SavePreference'>): Promise<WebMessageResponse<'SavePreference'>> {
        return webClient.request({ type: 'SavePreference', data });
    },

    /** Request the current value of a preference key from native storage. */
    fetchPreference: (data: Payload<'FetchPreference'>): Promise<WebMessageResponse<'FetchPreference'>> => {
        return webClient.request({ type: 'FetchPreference', data });
    },

    /** Report whether the in-web back action can still go back (dialog open). */
    setCanGoBack(canGoBack: boolean): void {
        webClient.post({ type: 'SetCanGoBack', data: { canGoBack } });
    },

    // ---------------------------------------------------------------
    // Auth
    // ---------------------------------------------------------------

    /** Start a native OAuth login flow for the given provider. */
    oauthLogin(provider: Payload<'OAuthLogin'>['provider']): Promise<WebMessageResponse<'OAuthLogin'>> {
        return webClient.request({ type: 'OAuthLogin', data: { provider } });
    },

    // ---------------------------------------------------------------
    // Contacts
    // ---------------------------------------------------------------

    /** Request the device contact list from native. */
    getContacts(): Promise<WebMessageResponse<'GetContacts'>> {
        return webClient.request({ type: 'GetContacts', data: {} });
    },

    // ---------------------------------------------------------------
    // SMS (ADR-0033 — relay invite deeplink delivery)
    // ---------------------------------------------------------------

    /**
     * Open the native SMS composer prefilled with `message` for `phoneNumbers`. Resolves with
     * `data.success` reporting whether the composer opened — the user still has to send it
     * themselves (there is no send-completion signal). Callers should fall back to a clipboard
     * copy when this rejects (no native bridge) or resolves with `success: false`.
     */
    sendSms(phoneNumbers: string | string[], message: string): Promise<WebMessageResponse<'SendSms'>> {
        return webClient.request({ type: 'SendSms', data: { phoneNumbers, message } });
    },

    // ---------------------------------------------------------------
    // Link preview
    // ---------------------------------------------------------------

    /**
     * Ask native to fetch and parse a page's og: metadata for a chat link preview — the webview
     * can't read cross-origin pages itself.
     *
     * Rejects on an older shell that has no handler (NOT_FOUND); callers treat that as "no
     * preview". This is also the single seam to swap if unfurling ever moves to the backend.
     */
    fetchUrlMetadata(url: string): Promise<WebMessageResponse<'FetchUrlMetadata'>> {
        return webClient.request({ type: 'FetchUrlMetadata', data: { url } });
    },

    // ---------------------------------------------------------------
    // In-app purchase
    // ---------------------------------------------------------------

    /** Initiate a native purchase flow. Result arrives as OnPurchaseSuccess / OnPurchaseError push events. */
    purchase(data: Payload<'Purchase'>): void {
        webClient.post({ type: 'Purchase', data });
    },

    /** Finish/acknowledge a completed purchase transaction. */
    finishPurchaseTransaction(
        purchase: Payload<'FinishPurchaseTransaction'>['purchase']
    ): Promise<WebMessageResponse<'FinishPurchaseTransaction'>> {
        return webClient.request({ type: 'FinishPurchaseTransaction', data: { purchase } });
    },

    /** Request the current set of native purchases. */
    fetchCurrentPurchases(): Promise<WebMessageResponse<'FetchCurrentPurchases'>> {
        return webClient.request({ type: 'FetchCurrentPurchases', data: {} });
    },

    /** Request the native product catalog. */
    fetchProducts(timeoutMs = 10_000): Promise<WebMessageResponse<'FetchProducts'>> {
        return webClient.request({ type: 'FetchProducts', data: {} }, { timeoutMs });
    },

    // ---------------------------------------------------------------
    // App log buffer (debug)
    // ---------------------------------------------------------------

    /** Fetch a page of the native app log buffer. */
    fetchAppLogBuffer(nonce: string, count: number): Promise<WebMessageResponse<'FetchAppLogBuffer'>> {
        return webClient.request({ type: 'FetchAppLogBuffer', nonce, data: { count } });
    },

    /** Poll the native app log buffer for the latest entries. */
    pollAppLogBuffer(nonce: string, count: number): Promise<WebMessageResponse<'PollAppLogBuffer'>> {
        return webClient.request({ type: 'PollAppLogBuffer', nonce, data: { count } });
    },

    /** Clear the native app log buffer. */
    clearAppLogBuffer(nonce: string): Promise<WebMessageResponse<'ClearAppLogBuffer'>> {
        return webClient.request({ type: 'ClearAppLogBuffer', data: { nonce } });
    },

    /** Fetch the current size of the native app log buffer. */
    fetchAppLogBufferSize(nonce: string): Promise<WebMessageResponse<'FetchAppLogBufferSize'>> {
        return webClient.request({ type: 'FetchAppLogBufferSize', data: { nonce } });
    },

    // ---------------------------------------------------------------
    // Deferred native reports (ADR-0047)
    // ---------------------------------------------------------------

    /** Pull reports the native side detected but cannot send itself. */
    fetchPendingReports(): Promise<WebMessageResponse<'FetchPendingReports'>> {
        return webClient.request({ type: 'FetchPendingReports', data: {} });
    },

    /** Acknowledge relayed reports so the native queue drops them. */
    ackPendingReports(ids: string[]): Promise<WebMessageResponse<'AckPendingReports'>> {
        return webClient.request({ type: 'AckPendingReports', data: { ids } });
    },
};
