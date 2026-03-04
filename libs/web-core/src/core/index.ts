import { WebCoreFactory } from '@lemoncloud/lemon-web-core';

export * from './simpleWebCore';

declare global {
    interface Window {
        ENV?: string;
        PROJECT?: string;
        REGION?: string;
        OAUTH_ENDPOINT?: string;
        HOST?: string;
        IMAGE_API_ENDPOINT?: string;
        SOCIAL_OAUTH_ENDPOINT?: string;
        DOU_ENDPOINT?: string;
        WS_ENDPOINT?: string;
    }
}

// localStorage takes priority (injected by mobile WebView for deeplink)
const getLocalStorageItem = (key: string): string | null => {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
};

/**
 * Environment configuration variables
 * - Loaded from Vite environment variables
 * - Normalized to lowercase for consistency
 * - Get ENV from index.html
 */
export const ENV = (window.ENV || import.meta.env.VITE_ENV || '').toLowerCase();
export const PROJECT = (window.PROJECT || import.meta.env.VITE_PROJECT || '').toLowerCase();
export const REGION = (window.REGION || import.meta.env.VITE_REGION || 'ap-northeast-2').toLowerCase();
export const OAUTH_ENDPOINT = (
    getLocalStorageItem('CHATIC_OAUTH_ENDPOINT') ||
    window.OAUTH_ENDPOINT ||
    import.meta.env.VITE_OAUTH_ENDPOINT ||
    ''
).toLowerCase();
export const HOST = (window.HOST || import.meta.env.VITE_HOST || '').toLowerCase();
export const SOCIAL_OAUTH_ENDPOINT = (
    window.SOCIAL_OAUTH_ENDPOINT ||
    import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT ||
    ''
).toLowerCase();
export const DOU_ENDPOINT =
    getLocalStorageItem('CHATIC_DOU_ENDPOINT') || window.DOU_ENDPOINT || import.meta.env.VITE_DOU_ENDPOINT || '';
export const WS_ENDPOINT =
    getLocalStorageItem('CHATIC_WS_ENDPOINT') || window.WS_ENDPOINT || import.meta.env.VITE_WS_ENDPOINT || '';

/**
 * Key for storing language preference
 */
export const LANGUAGE_KEY = 'i18nextLng';

/**
 * WebCore instance configuration and initialization
 * - Sets up cloud provider and project details
 * - Configures OAuth endpoint and region
 */
export const webCore = WebCoreFactory.create({
    cloud: 'aws',
    project: ENV === 'local' ? `${PROJECT}_${ENV}` : PROJECT, // NOTE: chatic native에서 project 고정
    oAuthEndpoint: OAUTH_ENDPOINT,
    region: REGION,
});
