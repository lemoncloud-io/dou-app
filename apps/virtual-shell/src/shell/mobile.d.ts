/**
 * The mobile app's modules, reached through the aliases in `vite.config.mts`. Declared by hand: an
 * import would make `@chatic/mobile` a dependency of this project. The compiler therefore does not
 * hold these against the app's own signatures — `mobile.spec.ts` calls the real functions through
 * the same aliases instead, so a change in the app's shapes fails it.
 */
declare module 'virtual-shell/mobile-deeplink' {
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
}

declare module 'virtual-shell/mobile-injection' {
    import type { AppInjectionParams } from '@chatic/fake-shell';

    export const getSyncInjectionScript: (params: AppInjectionParams) => string;
    export const getSafeAreaScript: (
        insets: { top: number; bottom: number; left: number; right: number },
        keyboardHeight: number
    ) => string;
}
