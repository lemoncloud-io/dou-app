import type { SubWebViewErrorCode } from '@chatic/bridge-messages';
import type { AppBridgeHostConfig, IAppBridgeHost } from '@chatic/bridges';
import { DESKTOP_SUB_WEBVIEW_OPEN_SCOPE } from '@chatic/mini-app-host';
import type { ISecureStorage } from '@chatic/storage-safe-storage';

import { DESKTOP_STORAGE_MEDIA } from './secureStorage/constants';
import type { DesktopSubWebViewService } from './subWebView/DesktopSubWebViewService';
import { fetchUrlMetadata } from './unfurl';

export interface DesktopBridgeDeps {
    showNotification: (params: { title: string; body: string; deeplink?: string }) => void;
    awaitFcmToken: () => Promise<string>;
    setBadgeCount: (count: number, overlayIconDataUrl?: string) => boolean;
    secureStorage: Pick<ISecureStorage, 'get' | 'save' | 'clear'>;
    subWebView: Pick<DesktopSubWebViewService, 'open' | 'close'>;
}

export const DESKTOP_MAIN_HOST_OPTIONS = {
    subWebViewOpenScope: DESKTOP_SUB_WEBVIEW_OPEN_SCOPE,
} satisfies Partial<AppBridgeHostConfig>;

const SUB_WEBVIEW_ERRORS: Record<SubWebViewErrorCode, string> = {
    INVALID:
        'An https url is required; title must be a string, params a JSON object of at most 16 KiB and appId one lower-case label.',
    NOT_ALLOWED: 'This shell does not open the url: it is not plain https, or could be read two ways.',
    ALREADY_OPEN: 'A sub WebView is already showing.',
    NOT_OPEN: 'No sub WebView with this viewId is showing.',
};

const subWebViewFailure = <T extends 'OnOpenSubWebView' | 'OnCloseSubWebView'>(type: T, code: SubWebViewErrorCode) => ({
    type,
    success: false,
    error: { code, message: SUB_WEBVIEW_ERRORS[code] },
});

const keepsMedium = (medium: unknown): boolean => (DESKTOP_STORAGE_MEDIA as readonly unknown[]).includes(medium);

const isStringRecord = (value: unknown): value is Record<string, string> =>
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string');

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(entry => typeof entry === 'string');

const invalid = <T extends 'OnStorageGet' | 'OnStorageSave' | 'OnStorageClear'>(type: T, message: string) => ({
    type,
    success: false,
    error: { code: 'INVALID', message },
});

export const registerHandlers = (host: IAppBridgeHost, deps: DesktopBridgeDeps): void => {
    host.registerHandler('ShowNotification', message => {
        const { title, body, deeplink } = message.data;
        deps.showNotification({ title, body, deeplink });
        return { type: 'OnShowNotification', success: true, data: { success: true } };
    });

    host.registerHandler('FetchUrlMetadata', async message => {
        const { url } = message.data;
        const meta = await fetchUrlMetadata(url);
        return { type: 'OnFetchUrlMetadata', success: true, data: meta };
    });

    host.registerHandler('FetchFcmToken', async () => {
        const token = await deps.awaitFcmToken();
        return { type: 'OnFetchFcmToken', success: true, data: { token } };
    });

    host.registerHandler('SetBadgeCount', message => {
        const { count } = message.data;
        const { overlayIconDataUrl } = message.data as { overlayIconDataUrl?: string };
        const ok = deps.setBadgeCount(count, overlayIconDataUrl);
        return { type: 'OnSetBadgeCount', success: true, data: { success: ok } };
    });

    host.registerHandler('SavePreference', message => ({
        type: 'OnSavePreference',
        success: true,
        data: { key: message.data.key, success: true },
    }));

    host.registerHandler('StorageGet', async message => {
        if (!keepsMedium(message.data?.medium)) return invalid('OnStorageGet', 'Unknown storage medium');
        return { type: 'OnStorageGet', success: true, data: await deps.secureStorage.get() };
    });

    host.registerHandler('StorageSave', async message => {
        const { medium, set, remove } = message.data ?? {};
        if (!keepsMedium(medium)) return invalid('OnStorageSave', 'Unknown storage medium');
        if (!isStringRecord(set) || !isStringArray(remove)) {
            return invalid('OnStorageSave', 'set must map keys to strings and remove must list keys');
        }
        return { type: 'OnStorageSave', success: true, data: { ok: await deps.secureStorage.save(set, remove) } };
    });

    host.registerHandler('OpenSubWebView', async message => {
        const result = deps.subWebView.open({
            url: message.data?.url,
            title: message.data?.title,
            params: message.data?.params,
            appId: message.data?.appId,
        });
        if (!result.ok) return subWebViewFailure('OnOpenSubWebView', result.code);
        return { type: 'OnOpenSubWebView', success: true, data: { viewId: result.view.viewId } };
    });

    host.registerHandler('CloseSubWebView', async message => {
        const result = deps.subWebView.close(message.data?.viewId, 'host');
        if (!result.ok) return subWebViewFailure('OnCloseSubWebView', result.code);
        return { type: 'OnCloseSubWebView', success: true, data: {} };
    });

    host.registerHandler('StorageClear', async message => {
        if (!keepsMedium(message.data?.medium)) return invalid('OnStorageClear', 'Unknown storage medium');
        return { type: 'OnStorageClear', success: true, data: { ok: await deps.secureStorage.clear() } };
    });
};
