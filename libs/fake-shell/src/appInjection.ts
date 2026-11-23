export interface AppInjectionParams {
    insets: { top: number; bottom: number; left: number; right: number };
    keyboardHeight: number;
    theme: 'light' | 'dark' | 'system';
    configBag: Record<string, string>;
    deviceInfo: Record<string, string | boolean>;
    capabilities?: {
        version: number;
        checkout: string[];
        media?: string;
        files?: string;
        links?: string;
        appShell?: string;
        signIn?: string;
        diagnostics?: string;
        push?: string;
    };
}

export interface AppInjectionModule {
    getSyncInjectionScript: (params: AppInjectionParams) => string;
}

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
