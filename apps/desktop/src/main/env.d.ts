/// <reference types="electron-vite/node" />

/** Build-time env baked by electron-vite (MAIN_VITE_* prefix → import.meta.env). See ADR-0003. */
interface ImportMetaEnv {
    /** Deployed Desktop Web URL the shell loads; unset in local dev → localhost:5005 fallback. */
    readonly MAIN_VITE_DESKTOP_WEB_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
