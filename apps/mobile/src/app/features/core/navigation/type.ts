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
