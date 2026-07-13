// Public runtime configuration for web-core consumers: env-derived endpoints, build identifiers, and
// the i18n language-storage key. The underlying values are resolved from `window.*` / `import.meta.env`
// at module load inside `transport/webTransport`; they are re-exported here under their public alias
// names so configuration reads as a surface distinct from the transport client itself.
export {
    WEB_DOU_ENDPOINT as DOU_ENDPOINT,
    WEB_ENV as ENV,
    WEB_OAUTH_ENDPOINT as OAUTH_ENDPOINT,
    WEB_PROJECT as PROJECT,
    WEB_SOCIAL_OAUTH_ENDPOINT as SOCIAL_OAUTH_ENDPOINT,
    WEB_WS_ENDPOINT as WS_ENDPOINT,
    startWebTransportInit as startWebCoreInit,
} from '../transport/webTransport';
export { LANGUAGE_KEY } from '../session/core';
