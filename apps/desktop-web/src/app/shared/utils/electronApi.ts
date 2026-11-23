export interface CustomUiStatus {
    active: boolean;
    root: string | null;
    error?: string;
}

export interface CustomUiApi {
    apply?: (zipUrl: string) => Promise<CustomUiStatus>;
    disable: () => Promise<CustomUiStatus>;
    status: () => Promise<CustomUiStatus>;
}

export interface LaunchAtLoginState {
    enabled: boolean;
    supported: boolean;
}

export interface LaunchAtLoginApi {
    get: () => Promise<LaunchAtLoginState>;
    set: (enabled: boolean) => Promise<LaunchAtLoginState>;
}

export interface DownloadDone {
    id?: string;
    name: string;
    state: 'completed' | 'interrupted';
}

export interface DownloadsApi {
    onDone: (listener: (done: DownloadDone) => void) => () => void;
    reveal: (id: string) => Promise<boolean>;
}

declare global {
    interface Window {
        electronAPI?: {
            appVersion: string;
            platform: string;
            customUi?: CustomUiApi;
            loginItem?: LaunchAtLoginApi;
            downloads?: DownloadsApi;
        };
    }
}

export const getCustomUiApi = (): CustomUiApi | undefined =>
    typeof window === 'undefined' ? undefined : window.electronAPI?.customUi;

export const getLoginItemApi = (): LaunchAtLoginApi | undefined =>
    typeof window === 'undefined' ? undefined : window.electronAPI?.loginItem;

export const getDownloadsApi = (): DownloadsApi | undefined =>
    typeof window === 'undefined' ? undefined : window.electronAPI?.downloads;
