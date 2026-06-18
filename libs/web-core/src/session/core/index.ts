export * from './cloudCore';
export * from './identityCore';
export * from './relayCore';
export {
    WEB_DOU_ENDPOINT as DOU_ENDPOINT,
    WEB_ENV as ENV,
    WEB_OAUTH_ENDPOINT as OAUTH_ENDPOINT,
    getDynamicRelayBackend as getDynamicDOUEndpoint,
    resetWebTransportInit as resetWebCoreInit,
    startWebTransportInit as startWebCoreInit,
} from '../../transport';
/**
 * Key for storing language preference
 */
export const LANGUAGE_KEY = 'i18nextLng';
