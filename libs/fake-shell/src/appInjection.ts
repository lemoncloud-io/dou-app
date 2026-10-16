/**
 * The parts of the app's `SyncInjectionScriptParams` a fake shell fills in. Declared here because the
 * type cannot be imported: the builder lives in `apps/mobile`, and every caller loads it without a
 * static import (see `guardAppInjection`).
 */
export interface AppInjectionParams {
    insets: { top: number; bottom: number; left: number; right: number };
    keyboardHeight: number;
    theme: 'light' | 'dark' | 'system';
    configBag: Record<string, string>;
    deviceInfo: Record<string, string | boolean>;
}

/** The shape of `apps/mobile/src/app/webview/utils/injectionScripts.ts`, as far as a fake shell calls it. */
export interface AppInjectionModule {
    getSyncInjectionScript: (params: AppInjectionParams) => string;
}

/**
 * Wraps the mobile app's own boot script builder (`getSyncInjectionScript`), not a copy of it: the
 * globals it sets — device info, the `ChaticMessageHandler` relay, the config bag, the safe-area
 * variables — are part of what the web reads at boot, and a copy would drift from what the app injects.
 *
 * Each caller loads that module without a static import: the e2e suite from a computed path at run
 * time, the virtual shell through a bundler alias. A static import would make the mobile app a
 * dependency of the caller's project, `nx sync` would then add it to its TypeScript references, and
 * typechecking that project would build the mobile app too — whose typecheck is red and left out of CI.
 * The file itself is a pure string builder with type-only imports, so loading it pulls nothing else in.
 *
 * What that costs is the compile-time check of the arguments against the app's parameter type. Two
 * checks stand in for it, neither complete. A built script that assigns `undefined` to a global — a
 * parameter the app reads and the shell does not pass — is refused here. And the script guards its own
 * body and reports a failure through the bridge (tag `INJECTION`), which a shell records in
 * `injectionErrors`. A missing parameter that ends up anywhere else in the text goes unnoticed, so when
 * the app's parameters change, `AppInjectionParams` has to follow.
 */
export const guardAppInjection =
    (module: AppInjectionModule) =>
    (params: AppInjectionParams): string => {
        const script = module.getSyncInjectionScript(params);
        const missing = script.match(/window\.(\w+)\s*=\s*undefined;/);
        if (missing) {
            throw new Error(`the app's injection script sets ${missing[1]} to undefined: a parameter is missing`);
        }
        return script;
    };
