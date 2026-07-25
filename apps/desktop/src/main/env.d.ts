/// <reference types="electron-vite/node" />

/** Build-time env baked by electron-vite (MAIN_VITE_* prefix → import.meta.env). See ADR-0003. */
interface ImportMetaEnv {
    /** Deployed Desktop Web URL the shell loads; unset in local dev → localhost:5005 fallback. */
    readonly MAIN_VITE_DESKTOP_WEB_URL?: string;
    /** Release channel: 'dev' isolates name/userData/protocol from the production app. */
    readonly MAIN_VITE_CHANNEL?: string;
    /**
     * PoC only: absolute path to an unpacked web bundle. When set, the shell serves that
     * directory under the custom-UI scheme and loads it instead of the remote web.
     * Slice 03 replaces this with a tray-driven ZIP download; nothing outside dev sets it.
     */
    readonly MAIN_VITE_CUSTOM_UI_ROOT?: string;
    /** FCM client config (CI-injected; .env.*.local for local builds) — see fcm.ts. */
    readonly MAIN_VITE_FCM_API_KEY?: string;
    readonly MAIN_VITE_FCM_PROJECT_ID?: string;
    readonly MAIN_VITE_FCM_SENDER_ID?: string;
    readonly MAIN_VITE_FCM_APP_ID?: string;
    readonly MAIN_VITE_FCM_PACKAGE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
