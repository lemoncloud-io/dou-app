/**
 * The mobile app's route functions, reached through the alias in `vite.shell.config.mts`. Declared by
 * hand: an import would make `@chatic/mobile` a dependency of this project, and its typecheck would
 * build the mobile app. The compiler therefore does not hold these against the app's own signatures —
 * `routes.spec.ts` calls the real functions through the same alias instead, so a change in what the
 * app returns fails it.
 */
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

/** The app's rule for which URLs the web may ask it to open (`useDeviceHandler`'s `OpenURL`). */
declare module 'shell-adapter/mobile-url-trust' {
    export const isOpenableUrl: (url: unknown) => boolean;
}
