/**
 * Where the web app under test is served, and the backend addresses it is built against.
 *
 * Every backend address sits under `.test`, a top-level domain reserved never to resolve (RFC 2606).
 * A request the fixtures do not answer therefore cannot reach anything real by accident: it fails,
 * and the catch-all route in `fixtures/backend.ts` reports it.
 */
export const E2E_PORT = Number(process.env['WEB_E2E_PORT'] ?? 5390);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export const E2E_ENDPOINTS = {
    /** `VITE_DOU_ENDPOINT` — the relay: guest login, memberships, clouds. */
    relay: 'https://dou.e2e.test/dou',
    oauth: 'https://oauth.e2e.test/dou',
    socialOAuth: 'https://social.e2e.test',
    image: 'https://image.e2e.test',
    backend: 'https://backend.e2e.test/d1',
    soc: 'https://soc.e2e.test/soc',
    iap: 'https://iap.e2e.test/iap',
    /** `VITE_WS_ENDPOINT` — the relay socket. */
    socket: 'wss://ws.e2e.test/cht',
} as const;

/**
 * The whole `VITE_*` set the web reads, given explicitly. Vite still loads `apps/web/.env` when a
 * developer has one, but a variable already in the process environment wins over the file, so
 * naming every key here is what keeps a local run from picking up a real endpoint, a debug code or
 * Firebase keys from that file.
 */
export const WEB_SERVER_ENV: Record<string, string> = {
    VITE_ENV: 'LOCAL',
    VITE_PROJECT: 'CHATIC',
    VITE_HOST: E2E_BASE_URL,
    VITE_DOU_ENDPOINT: E2E_ENDPOINTS.relay,
    VITE_OAUTH_ENDPOINT: E2E_ENDPOINTS.oauth,
    VITE_SOCIAL_OAUTH_ENDPOINT: E2E_ENDPOINTS.socialOAuth,
    VITE_IMAGE_API_ENDPOINT: E2E_ENDPOINTS.image,
    VITE_BACKEND_ENDPOINT: E2E_ENDPOINTS.backend,
    VITE_SOC_ENDPOINT: E2E_ENDPOINTS.soc,
    VITE_IAP_ENDPOINT: E2E_ENDPOINTS.iap,
    VITE_WS_ENDPOINT: E2E_ENDPOINTS.socket,
    VITE_WEBVIEW_BASE_URL: E2E_BASE_URL,
    VITE_REGION: 'ap-northeast-2',
    VITE_DEBUG_CODE: '',
    VITE_DESKTOP_PROTOCOL: '',
    VITE_LOG_UPLOAD_DISABLED: 'true',
    VITE_FIREBASE_API_KEY: '',
    VITE_FIREBASE_AUTH_DOMAIN: '',
    VITE_FIREBASE_PROJECT_ID: '',
    VITE_FIREBASE_STORAGE_BUCKET: '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '',
    VITE_FIREBASE_APP_ID: '',
    VITE_FIREBASE_MEASUREMENT_ID: '',
};
