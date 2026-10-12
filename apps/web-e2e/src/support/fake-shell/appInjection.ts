import * as path from 'node:path';

/**
 * The parts of the app's `SyncInjectionScriptParams` the fake shell fills in. Declared here because
 * the type cannot be imported — see `loadAppInjection`.
 */
export interface AppInjectionParams {
    insets: { top: number; bottom: number; left: number; right: number };
    keyboardHeight: number;
    theme: 'light' | 'dark' | 'system';
    configBag: Record<string, string>;
    deviceInfo: Record<string, string | boolean>;
}

const SOURCE = path.resolve(__dirname, '../../../../mobile/src/app/webview/utils/injectionScripts.ts');

/**
 * The mobile app's own boot script builder (`getSyncInjectionScript`), not a copy of it: the globals
 * it sets — device info, the `ChaticMessageHandler` relay, the config bag, the safe-area variables —
 * are part of what the web reads at boot, and a copy would drift from what the app injects.
 *
 * It is loaded at run time from a computed path on purpose. A static import makes the mobile app a
 * dependency of this project, `nx sync` then adds it to this project's TypeScript references, and
 * typechecking this project would build the mobile app too — whose typecheck is red and left out of
 * CI. The file itself is a pure string builder with type-only imports, so loading it pulls nothing
 * else in.
 *
 * What that costs is the compile-time check of the arguments against the app's parameter type. Two
 * checks stand in for it, neither complete. A built script that assigns `undefined` to a global — a
 * parameter the app reads and this shell does not pass — is refused here. And the script guards its
 * own body and reports a failure through the bridge (tag `INJECTION`), which the fake shell fails the
 * test on. A missing parameter that ends up anywhere else in the text goes unnoticed, so when the
 * app's parameters change, `AppInjectionParams` has to follow.
 */
export const loadAppInjection = async (): Promise<(params: AppInjectionParams) => string> => {
    const module = (await import(SOURCE)) as { getSyncInjectionScript: (params: AppInjectionParams) => string };
    return params => {
        const script = module.getSyncInjectionScript(params);
        const missing = script.match(/window\.(\w+)\s*=\s*undefined;/);
        if (missing) {
            throw new Error(`the app's injection script sets ${missing[1]} to undefined: a parameter is missing`);
        }
        return script;
    };
};
