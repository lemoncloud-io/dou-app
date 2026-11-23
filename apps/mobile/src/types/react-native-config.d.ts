declare module 'react-native-config' {
    export interface NativeConfig {
        VITE_ENV: string;
        VITE_WEBVIEW_BASE_URL: string;
        VITE_WS_ENDPOINT: string;
        VITE_SUBSCRIPTION_IAP_SKUS_IOS: string;
        VITE_SUBSCRIPTION_IAP_SKUS_ANDROID: string;
        VITE_SUBSCRIPTION_IAP_PLANS_ANDROID: string;
        VIEW_APP_NAME: string;
        VITE_GOOGLE_WEB_CLIENT_ID: string;
        VITE_PROJECT?: string;
        VITE_HOST?: string;
        VITE_OAUTH_ENDPOINT?: string;
        VITE_SOCIAL_OAUTH_ENDPOINT?: string;
        VITE_BACKEND_ENDPOINT?: string;
        VITE_DOU_ENDPOINT?: string;
        VITE_SESSION_OWNER_DEFAULT?: string;
    }

    export const Config: NativeConfig;
    export default Config;
}
