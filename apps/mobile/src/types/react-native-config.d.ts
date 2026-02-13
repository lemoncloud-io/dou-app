declare module 'react-native-config' {
    export interface NativeConfig {
        VITE_ENV: string;
        VITE_WEBVIEW_BASE_URL: string;
        VITE_WS_ENDPOINT: string;
        VITE_SUBSCRIPTION_IAP_SKUS_IOS: string;
        VITE_SUBSCRIPTION_IAP_SKUS_ANDROID: string;
        VIEW_APP_NAME: string;
    }

    export const Config: NativeConfig;
    export default Config;
}
