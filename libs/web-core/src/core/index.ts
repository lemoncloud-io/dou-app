import { WebCoreFactory } from '@lemoncloud/lemon-web-core';

declare global {
    interface Window {
        ENV?: string;
        PROJECT?: string;
        REGION?: string;
        OAUTH_ENDPOINT?: string;
        HOST?: string;
        IMAGE_API_ENDPOINT?: string;
        SOCIAL_OAUTH_ENDPOINT?: string;
    }
}

/**
 * Environment configuration variables
 * - Loaded from Vite environment variables
 * - Normalized to lowercase for consistency
 * - Get ENV from index.html
 */
export const ENV = (window.ENV || import.meta.env.VITE_ENV || '').toLowerCase();
export const PROJECT = (window.PROJECT || import.meta.env.VITE_PROJECT || '').toLowerCase();
export const REGION = (window.REGION || import.meta.env.VITE_REGION || 'ap-northeast-2').toLowerCase();
export const OAUTH_ENDPOINT = (window.OAUTH_ENDPOINT || import.meta.env.VITE_OAUTH_ENDPOINT || '').toLowerCase();
export const HOST = (window.HOST || import.meta.env.VITE_HOST || '').toLowerCase();
export const SOCIAL_OAUTH_ENDPOINT = (
    window.SOCIAL_OAUTH_ENDPOINT ||
    import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT ||
    ''
).toLowerCase();

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
    project: `${PROJECT}_${ENV}`,
    oAuthEndpoint: OAUTH_ENDPOINT,
    region: REGION,
});
