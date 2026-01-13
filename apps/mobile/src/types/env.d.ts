declare namespace NodeJS {
    interface ProcessEnv {
        readonly WEBVIEW_BASE_URL: string;
        readonly APP_ENV: 'dev' | 'prod';
    }
}
