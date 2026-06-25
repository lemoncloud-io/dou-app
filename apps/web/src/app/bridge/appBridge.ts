import { webClient } from '@chatic/bridges';
import type { WebMessageData, WebMessageType } from '@chatic/app-messages';

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

    /** Notify native shell that the web app has mounted and is ready. */
    notifyWebAppReady(): void {
        webClient.post({ type: 'WebAppReady', data: {} });
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

    // ---------------------------------------------------------------
    // Notification & device
    // ---------------------------------------------------------------

    /** Request the current FCM device token from native. */
    fetchFcmToken(): void {
        webClient.post({ type: 'FetchFcmToken', data: {} });
    },

    /** Set the app icon badge count. */
    setBadgeCount(count: number): void {
        webClient.post({ type: 'SetBadgeCount', data: { count } });
    },

    // ---------------------------------------------------------------
    // Preference & back handling
    // ---------------------------------------------------------------

    /** Persist a preference key/value in native storage. */
    savePreference(data: Payload<'SavePreference'>): void {
        webClient.post({ type: 'SavePreference', data });
    },

    /** Request the current value of a preference key from native storage. */
    fetchPreference: (data: Payload<'FetchPreference'>): void => {
        webClient.post({ type: 'FetchPreference', data });
    },

    /** Report whether the in-web back action can still go back (dialog open). */
    setCanGoBack(canGoBack: boolean): void {
        webClient.post({ type: 'SetCanGoBack', data: { canGoBack } });
    },

    // ---------------------------------------------------------------
    // Auth
    // ---------------------------------------------------------------

    /** Start a native OAuth login flow for the given provider. */
    oauthLogin(provider: Payload<'OAuthLogin'>['provider']): void {
        webClient.post({ type: 'OAuthLogin', data: { provider } });
    },

    // ---------------------------------------------------------------
    // Contacts
    // ---------------------------------------------------------------

    /** Request the device contact list from native. */
    getContacts(): void {
        webClient.post({ type: 'GetContacts', data: {} });
    },

    // ---------------------------------------------------------------
    // In-app purchase
    // ---------------------------------------------------------------

    /** Start a native purchase for the given product. */
    purchase(data: Payload<'Purchase'>): void {
        webClient.post({ type: 'Purchase', data });
    },

    /** Finish/acknowledge a completed purchase transaction. */
    finishPurchaseTransaction(purchase: Payload<'FinishPurchaseTransaction'>['purchase']): void {
        webClient.post({ type: 'FinishPurchaseTransaction', data: { purchase } });
    },

    /** Request the current set of native purchases. */
    fetchCurrentPurchases(): void {
        webClient.post({ type: 'FetchCurrentPurchases', data: {} });
    },

    /** Request the native product catalog. */
    fetchProducts(): void {
        webClient.post({ type: 'FetchProducts', data: {} });
    },

    // ---------------------------------------------------------------
    // App log buffer (debug)
    // ---------------------------------------------------------------

    /** Fetch a page of the native app log buffer. */
    fetchAppLogBuffer(nonce: string, count: number): void {
        webClient.post({ type: 'FetchAppLogBuffer', nonce, data: { count } });
    },

    /** Poll the native app log buffer for the latest entries. */
    pollAppLogBuffer(nonce: string, count: number): void {
        webClient.post({ type: 'PollAppLogBuffer', nonce, data: { count } });
    },

    /** Clear the native app log buffer. */
    clearAppLogBuffer(nonce: string): void {
        webClient.post({ type: 'ClearAppLogBuffer', data: { nonce } });
    },

    /** Fetch the current size of the native app log buffer. */
    fetchAppLogBufferSize(nonce: string): void {
        webClient.post({ type: 'FetchAppLogBufferSize', data: { nonce } });
    },
};
