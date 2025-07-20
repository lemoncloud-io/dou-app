/// <reference types="vite/client" />

interface ImportMetaEnv {
    VITE_REGION?: string;
    VITE_ENV: string;
    VITE_PROJECT: string;
    VITE_HOST: string;
    VITE_OAUTH_ENDPOINT: string;
    VITE_SOCIAL_OAUTH_ENDPOINT: string;
    VITE_IMAGE_API_ENDPOINT: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
