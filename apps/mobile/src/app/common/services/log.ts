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
    | 'SQLITE';

export type LogListener = (level: LogLevel, tag: LogTag, message: string, data?: any, error?: any) => void;

const listeners = new Set<LogListener>();

const notifyListeners = (...args: Parameters<LogListener>) => {
    listeners.forEach(listener => {
        try {
            listener(...args);
        } catch {
            console.warn(`Failed to listening log. ${JSON.stringify(listener)}`);
        }
    });
};

/**
 * LogService (logger)
 *
 * 앱 전역에서 발생하는 로그를 중앙에서 관리하는 서비스
 * - 개발 모드(`__DEV__`)의 경우 콘솔(Console)에 로그 출력
 * - 리스너(Listener): 등록된 외부 리스너(WebView Bridge, Analytics 등)로 로그 전파
 */
export const logger = {
    subscribe: (listener: LogListener) => {
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    },

    /**
     * 디버깅
     * @param tag 태그; `LogTag` 참고
     * @param message 로그 메시지
     * @param data 데이터
     */
    debug: (tag: LogTag, message: string, data?: any) => {
        notifyListeners('debug', tag, message, data);
    },

    /**
     * 앱 흐름 확인
     * @param tag 태그; `LogTag` 참고
     * @param message 로그 메시지
     * @param data 데이터
     */
    info: (tag: LogTag, message: string, data?: any) => {
        notifyListeners('info', tag, message, data);
    },

    /**
     * 경고
     * @param tag 태그; `LogTag` 참고
     * @param message 로그 메시지
     * @param data 데이터
     */
    warn: (tag: LogTag, message: string, data?: any) => {
        notifyListeners('warn', tag, message, data);
    },

    /**
     * 에러
     * @param tag 태그; `LogTag` 참고
     * @param message 에러 메시지
     * @param error 에러 StackTrace
     */
    error: (tag: LogTag, message: string, error?: any) => {
        notifyListeners('error', tag, message, undefined, error);
    },
};
