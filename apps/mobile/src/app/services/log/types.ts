export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogTag =
    | 'APP'
    | 'NOTIFICATION'
    | 'FIREBASE'
    | 'IAP'
    | 'BRIDGE'
    | 'NETWORK'
    | 'WEBVIEW'
    | 'GLOBAL'
    | 'STORAGE'
    | 'CACHE'
    | 'PERMISSION'
    | 'DEVICE'
    | 'DEEPLINK'
    | 'OAUTH'
    | 'SQLITE'
    | 'LOG_BUFFER'
    | 'APP_ICON'
    | 'Preference';

export type LogListener = (level: LogLevel, tag: LogTag, message: string, data?: any, error?: any) => void;

export interface ILogService {
    subscribe(listener: LogListener): () => void;
    debug(tag: LogTag, message: string, data?: any): void;
    info(tag: LogTag, message: string, data?: any): void;
    warn(tag: LogTag, message: string, data?: any): void;
    error(tag: LogTag, message: string, error?: any): void;
}
