export * from './cloudCore';
export * from './relayCore';
export {
    WEB_DOU_ENDPOINT as DOU_ENDPOINT,
    WEB_ENV as ENV,
    WEB_HOST as HOST,
    WEB_OAUTH_ENDPOINT as OAUTH_ENDPOINT,
    WEB_PROJECT as PROJECT,
    WEB_REGION as REGION,
    WEB_SOCIAL_OAUTH_ENDPOINT as SOCIAL_OAUTH_ENDPOINT,
    WEB_WS_ENDPOINT as WS_ENDPOINT,
    getDynamicRelayBackend as getDynamicDOUEndpoint,
    getDynamicRelayWss as getDynamicWSEndpoint,
    resetWebTransportInit as resetWebCoreInit,
    startWebTransportInit as startWebCoreInit,
} from '../transport/webTransport';

/**
 * Key for storing language preference
 */
export const LANGUAGE_KEY = 'i18nextLng';
