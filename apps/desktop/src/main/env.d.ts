/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
    readonly MAIN_VITE_DESKTOP_WEB_URL?: string;
    readonly MAIN_VITE_CHANNEL?: string;
    readonly MAIN_VITE_CUSTOM_UI_ROOT?: string;
    readonly MAIN_VITE_FCM_API_KEY?: string;
    readonly MAIN_VITE_FCM_PROJECT_ID?: string;
    readonly MAIN_VITE_FCM_SENDER_ID?: string;
    readonly MAIN_VITE_FCM_APP_ID?: string;
    readonly MAIN_VITE_FCM_PACKAGE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
