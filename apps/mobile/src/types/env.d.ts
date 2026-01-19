declare namespace NodeJS {
    interface ProcessEnv {
        readonly VITE_ENV: 'LOCAL' | 'DEV' | 'PROD';
        readonly VITE_WEBVIEW_BASE_URL: string;
        readonly VITE_WS_ENDPOINT: string;
    }
}
