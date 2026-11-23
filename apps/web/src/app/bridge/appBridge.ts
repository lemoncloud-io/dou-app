import { webClient } from '@chatic/bridges';
import type {
    HapticKind,
    OnFetchPushMarksPayload,
    OnWebAppReadyPayload,
    PushCloudMarkRecord,
    SessionOwnerName,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
} from '@chatic/bridge-messages';

export const MEDIA_EXPORT_TIMEOUT_MS = 10 * 60_000;

type Payload<K extends WebMessageType> = WebMessageData<K>['data'];

export const appBridge = {
    notifyWebAppReady(): Promise<OnWebAppReadyPayload | null> {
        return webClient
            .request({ type: 'WebAppReady', data: { holdsBootSplash: true } })
            .then(response => (response?.data as OnWebAppReadyPayload | undefined) ?? null)
            .catch(() => null);
    },

    notifyFirstScreenReady(): void {
        webClient.post({ type: 'FirstScreenReady', data: {} });
    },

    dismissResumeOverlay(): void {
        webClient.post({ type: 'DismissResumeOverlay', data: {} });
    },

    openURL(url: string): void {
        webClient.post({ type: 'OpenURL', data: { url } });
    },

    openSettings(): void {
        webClient.post({ type: 'OpenSettings', data: {} });
    },

    openShareSheet(url: string): void {
        webClient.post({ type: 'OpenShareSheet', data: { url } });
    },

    openSubscriptionManagement(): void {
        webClient.post({ type: 'OpenSubscriptionManagement', data: {} });
    },

    copyClipBoard(text: string) {
        return webClient.request({ type: 'CopyToClipboard', data: { text } });
    },

    sendBootMetrics(data: Payload<'SendBootMetrics'>): void {
        webClient.post({ type: 'SendBootMetrics', data });
    },

    startPerfTrace(data: Payload<'StartPerfTrace'>): void {
        webClient.post({ type: 'StartPerfTrace', data });
    },

    stopPerfTrace(data: Payload<'StopPerfTrace'>): void {
        webClient.post({ type: 'StopPerfTrace', data });
    },

    setDebugMode(enabled: boolean): void {
        webClient.post({ type: 'SetDebugMode', data: { enabled } });
    },

    checkAppUpdate(): Promise<WebMessageResponse<'CheckAppUpdate'>> {
        return webClient.request({ type: 'CheckAppUpdate', data: {} });
    },

    openStore(): void {
        webClient.post({ type: 'OpenStore', data: {} });
    },

    fetchFcmToken(): Promise<WebMessageResponse<'FetchFcmToken'>> {
        return webClient.request({ type: 'FetchFcmToken', data: {} });
    },

    setBadgeCount(count: number): void {
        webClient.post({ type: 'SetBadgeCount', data: { count } });
    },

    fetchPushMarks(): Promise<PushCloudMarkRecord[]> {
        return webClient
            .request({ type: 'FetchPushMarks', data: {} })
            .then(response => (response?.data as OnFetchPushMarksPayload | undefined)?.marks ?? [])
            .catch(() => []);
    },

    savePreference(data: Payload<'SavePreference'>): void {
        webClient.post({ type: 'SavePreference', data });
    },

    savePreferenceConfirmed(data: Payload<'SavePreference'>): Promise<WebMessageResponse<'SavePreference'>> {
        return webClient.request({ type: 'SavePreference', data });
    },

    fetchPreference: (data: Payload<'FetchPreference'>): Promise<WebMessageResponse<'FetchPreference'>> => {
        return webClient.request({ type: 'FetchPreference', data });
    },

    deletePreferenceConfirmed(data: Payload<'DeletePreference'>): Promise<WebMessageResponse<'DeletePreference'>> {
        return webClient.request({ type: 'DeletePreference', data });
    },

    setCanGoBack(canGoBack: boolean): void {
        webClient.post({ type: 'SetCanGoBack', data: { canGoBack, includesHistory: true } });
    },

    startOAuthLogin(provider: Payload<'OAuthLogin'>['provider']): void {
        webClient.post({ type: 'OAuthLogin', data: { provider } });
    },

    oauthLogin(
        provider: Payload<'OAuthLogin'>['provider'],
        timeoutMs = 180_000
    ): Promise<WebMessageResponse<'OAuthLogin'>> {
        return webClient.request({ type: 'OAuthLogin', data: { provider } }, { timeoutMs });
    },

    getContacts(timeoutMs = 60_000): Promise<WebMessageResponse<'GetContacts'>> {
        return webClient.request({ type: 'GetContacts', data: {} }, { timeoutMs });
    },

    sendSms(phoneNumbers: string | string[], message: string): Promise<WebMessageResponse<'SendSms'>> {
        return webClient.request({ type: 'SendSms', data: { phoneNumbers, message } });
    },

    fetchUrlMetadata(url: string): Promise<WebMessageResponse<'FetchUrlMetadata'>> {
        return webClient.request({ type: 'FetchUrlMetadata', data: { url } });
    },

    purchase(data: Payload<'Purchase'>): void {
        webClient.post({ type: 'Purchase', data });
    },

    finishPurchaseTransaction(
        purchase: Payload<'FinishPurchaseTransaction'>['purchase']
    ): Promise<WebMessageResponse<'FinishPurchaseTransaction'>> {
        return webClient.request({ type: 'FinishPurchaseTransaction', data: { purchase } });
    },

    fetchCurrentPurchases(): Promise<WebMessageResponse<'FetchCurrentPurchases'>> {
        return webClient.request({ type: 'FetchCurrentPurchases', data: {} });
    },

    fetchProducts(timeoutMs = 10_000): Promise<WebMessageResponse<'FetchProducts'>> {
        return webClient.request({ type: 'FetchProducts', data: {} }, { timeoutMs });
    },

    fetchLogUploadQueue(limit: number): Promise<WebMessageResponse<'FetchLogUploadQueue'>> {
        return webClient.request({ type: 'FetchLogUploadQueue', data: { limit } });
    },

    ackLogUploadQueue(ids: string[]): Promise<WebMessageResponse<'AckLogUploadQueue'>> {
        return webClient.request({ type: 'AckLogUploadQueue', data: { ids } });
    },

    clearLogUploadQueue(): Promise<WebMessageResponse<'ClearLogUploadQueue'>> {
        return webClient.request({ type: 'ClearLogUploadQueue', data: {} });
    },

    fetchBootRecords(): Promise<WebMessageResponse<'FetchBootRecords'>> {
        return webClient.request({ type: 'FetchBootRecords', data: {} });
    },

    clearBootRecords(): Promise<WebMessageResponse<'ClearBootRecords'>> {
        return webClient.request({ type: 'ClearBootRecords', data: {} });
    },

    fetchNativeStorageSummary(timeoutMs = 60_000): Promise<WebMessageResponse<'FetchNativeStorageSummary'>> {
        return webClient.request({ type: 'FetchNativeStorageSummary', data: {} }, { timeoutMs });
    },

    clearNativeCache(includeInvitedClouds: boolean): Promise<WebMessageResponse<'ClearNativeCache'>> {
        return webClient.request({ type: 'ClearNativeCache', data: { includeInvitedClouds } });
    },

    deleteFcmToken(): Promise<WebMessageResponse<'DeleteFcmToken'>> {
        return webClient.request({ type: 'DeleteFcmToken', data: {} });
    },

    fetchBadgeCount(): Promise<WebMessageResponse<'FetchBadgeCount'>> {
        return webClient.request({ type: 'FetchBadgeCount', data: {} });
    },

    fetchBadgeBase(): Promise<WebMessageResponse<'FetchBadgeBase'>> {
        return webClient.request({ type: 'FetchBadgeBase', data: {} });
    },

    showNotification(payload: Payload<'ShowNotification'>): Promise<WebMessageResponse<'ShowNotification'>> {
        return webClient.request({ type: 'ShowNotification', data: payload });
    },

    applyCustomZip(url: string): Promise<WebMessageResponse<'ApplyCustomZip'>> {
        return webClient.request({ type: 'ApplyCustomZip', data: { url } });
    },

    disableCustomZip(): Promise<WebMessageResponse<'DisableCustomZip'>> {
        return webClient.request({ type: 'DisableCustomZip', data: {} });
    },

    fetchCustomZipStatus(): Promise<WebMessageResponse<'FetchCustomZipStatus'>> {
        return webClient.request({ type: 'FetchCustomZipStatus', data: {} });
    },

    fetchSessionOwner(): Promise<WebMessageResponse<'FetchSessionOwner'>> {
        return webClient.request({ type: 'FetchSessionOwner', data: {} });
    },

    setSessionOwner(owner: SessionOwnerName): Promise<WebMessageResponse<'SetSessionOwner'>> {
        return webClient.request({ type: 'SetSessionOwner', data: { owner } });
    },

    setDefaultSessionOwner(owner: SessionOwnerName | null): Promise<WebMessageResponse<'SetDefaultSessionOwner'>> {
        return webClient.request({ type: 'SetDefaultSessionOwner', data: { owner } });
    },

    fetchAppIcon(): Promise<WebMessageResponse<'FetchAppIcon'>> {
        return webClient.request({ type: 'FetchAppIcon', data: {} });
    },

    fetchAppIconList(): Promise<WebMessageResponse<'FetchAppIconList'>> {
        return webClient.request({ type: 'FetchAppIconList', data: {} });
    },

    changeAppIcon(iconName: string | null): Promise<WebMessageResponse<'ChangeAppIcon'>> {
        return webClient.request({ type: 'ChangeAppIcon', data: { iconName } });
    },

    oAuthLogin(provider: Payload<'OAuthLogin'>['provider']): Promise<WebMessageResponse<'OAuthLogin'>> {
        return webClient.request({ type: 'OAuthLogin', data: { provider } });
    },

    oAuthLogout(provider: Payload<'OAuthLogout'>['provider']): Promise<WebMessageResponse<'OAuthLogout'>> {
        return webClient.request({ type: 'OAuthLogout', data: { provider } });
    },

    openCamera(payload: Payload<'OpenCamera'> = {}): Promise<WebMessageResponse<'OpenCamera'>> {
        return webClient.request({ type: 'OpenCamera', data: payload });
    },

    openPhotoLibrary(payload: Payload<'OpenPhotoLibrary'> = {}): Promise<WebMessageResponse<'OpenPhotoLibrary'>> {
        return webClient.request({ type: 'OpenPhotoLibrary', data: payload });
    },

    openDocument(payload: Payload<'OpenDocument'> = {}): Promise<WebMessageResponse<'OpenDocument'>> {
        return webClient.request({ type: 'OpenDocument', data: payload });
    },

    listPhotoAlbums(
        payload: Payload<'ListPhotoAlbums'> = {},
        timeoutMs = 60_000
    ): Promise<WebMessageResponse<'ListPhotoAlbums'>> {
        return webClient.request({ type: 'ListPhotoAlbums', data: payload }, { timeoutMs });
    },

    listPhotos(payload: Payload<'ListPhotos'>, timeoutMs = 60_000): Promise<WebMessageResponse<'ListPhotos'>> {
        return webClient.request({ type: 'ListPhotos', data: payload }, { timeoutMs });
    },

    readPhoto(id: string, timeoutMs = 120_000): Promise<WebMessageResponse<'ReadPhoto'>> {
        return webClient.request({ type: 'ReadPhoto', data: { id } }, { timeoutMs });
    },

    keepLibraryVideo(id: string, timeoutMs = 10 * 60_000): Promise<WebMessageResponse<'KeepLibraryVideo'>> {
        return webClient.request({ type: 'KeepLibraryVideo', data: { id } }, { timeoutMs });
    },

    readVideoFrame(
        payload: Payload<'ReadVideoFrame'>,
        timeoutMs = 25_000
    ): Promise<WebMessageResponse<'ReadVideoFrame'>> {
        return webClient.request({ type: 'ReadVideoFrame', data: payload }, { timeoutMs });
    },

    managePhotoSelection(timeoutMs = 300_000): Promise<WebMessageResponse<'ManagePhotoSelection'>> {
        return webClient.request({ type: 'ManagePhotoSelection', data: {} }, { timeoutMs });
    },

    saveToPhotoLibrary(uri: string): Promise<WebMessageResponse<'SaveToPhotoLibrary'>> {
        return webClient.request({ type: 'SaveToPhotoLibrary', data: { uri } }, { timeoutMs: MEDIA_EXPORT_TIMEOUT_MS });
    },

    shareFile(uri: string, title?: string): Promise<WebMessageResponse<'ShareFile'>> {
        return webClient.request(
            { type: 'ShareFile', data: { uri, ...(title ? { title } : {}) } },
            { timeoutMs: MEDIA_EXPORT_TIMEOUT_MS }
        );
    },

    postHaptic(kind: HapticKind): void {
        webClient.post({ type: 'TriggerHaptic', data: { kind } });
    },

    openSubWebView(
        url: string,
        title?: string,
        params?: Payload<'OpenSubWebView'>['params'],
        appId?: string
    ): Promise<WebMessageResponse<'OpenSubWebView'>> {
        return webClient.request({
            type: 'OpenSubWebView',
            data: { url, ...(title ? { title } : {}), ...(params ? { params } : {}), ...(appId ? { appId } : {}) },
        });
    },

    closeSubWebView(viewId: string): Promise<WebMessageResponse<'CloseSubWebView'>> {
        return webClient.request({ type: 'CloseSubWebView', data: { viewId } });
    },

    copyToClipboard(text: string): Promise<WebMessageResponse<'CopyToClipboard'>> {
        return webClient.request({ type: 'CopyToClipboard', data: { text } });
    },

    requestPermission(
        permission: Payload<'RequestPermission'>['permission'],
        timeoutMs = 60_000
    ): Promise<WebMessageResponse<'RequestPermission'>> {
        return webClient.request({ type: 'RequestPermission', data: { permission } }, { timeoutMs });
    },

    fetchPendingReports(): Promise<WebMessageResponse<'FetchPendingReports'>> {
        return webClient.request({ type: 'FetchPendingReports', data: {} });
    },

    ackPendingReports(ids: string[]): Promise<WebMessageResponse<'AckPendingReports'>> {
        return webClient.request({ type: 'AckPendingReports', data: { ids } });
    },

    saveConfigValueConfirmed(data: Payload<'SaveConfigValue'>): Promise<WebMessageResponse<'SaveConfigValue'>> {
        return webClient.request({ type: 'SaveConfigValue', data });
    },

    clearConfigValueConfirmed(data: Payload<'ClearConfigValue'>): Promise<WebMessageResponse<'ClearConfigValue'>> {
        return webClient.request({ type: 'ClearConfigValue', data });
    },
};
