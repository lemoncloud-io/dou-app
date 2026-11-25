// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; the sub-webview trust rules move to a platform-free mini-app protocol package
import type { SubWebViewTrust } from '@chatic/shared/subWebViewTrust';

export type RootStackParamList = {
    Main: undefined;
    SubWebView: {
        viewId: string;
        url: string;
        title?: string;
        params: Record<string, unknown>;
        appId?: string;
        trust: SubWebViewTrust;
    };
};
