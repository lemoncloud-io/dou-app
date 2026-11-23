declare module 'shell-adapter/mobile-deeplink' {
    export interface PushNavigationData {
        link?: unknown;
        clickAction?: unknown;
        type?: unknown;
        payload?: unknown;
        cid?: unknown;
        sid?: unknown;
        [key: string]: unknown;
    }

    export type DeepLinkResolution =
        | { kind: 'web'; path: string }
        | {
              kind: 'native';
              state: { routes: Array<{ name: string; state?: unknown; params?: Record<string, string> }> };
          }
        | { kind: 'invalid'; error: string };

    export const resolvePushTapPath: (data: PushNavigationData | undefined | null) => string | null;
    export const resolveDeepLink: (rawUrl: string) => DeepLinkResolution;
    export const isCustomScheme: (scheme: string) => boolean;
}

declare module 'shell-adapter/mobile-url-trust' {
    export const isOpenableUrl: (url: unknown) => boolean;
}
