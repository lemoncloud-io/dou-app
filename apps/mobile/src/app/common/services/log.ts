type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogTag =
    | 'APP'
    | 'FCM'
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
    | 'OAUTH';

type LogListener = (level: LogLevel, tag: LogTag, message: string, data?: any, error?: any) => void;

/**
 * - 구조화된 에러 문자열 치환
 * @param error error 객체
 */
const serializeError = (error: any) => {
    if (!error) return 'Unknown error.';

    if (error instanceof Error) {
        return {
            ...error,
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    if (typeof error === 'object') {
        return error;
    }

    return String(error);
};

const listeners = new Set<LogListener>();

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
        if (__DEV__) {
            const time = new Date().toLocaleTimeString();
            console.debug(`[${time}] [${tag}] ${message}`, data ? data : '');
        }
        listeners.forEach(fn => fn('debug', tag, message, data));
    },

    /**
     * 앱 흐름 확인
     * @param tag 태그; `LogTag` 참고
     * @param message 로그 메시지
     * @param data 데이터
     */
    info: (tag: LogTag, message: string, data?: any) => {
        if (__DEV__) {
            const time = new Date().toLocaleTimeString();
            console.info(`[${time}] [${tag}] ${message}`, data ? data : '');
        }
        listeners.forEach(fn => fn('info', tag, message, data));
    },

    /**
     * 경고
     * @param tag 태그; `LogTag` 참고
     * @param message 로그 메시지
     * @param data 데이터
     */
    warn: (tag: LogTag, message: string, data?: any) => {
        if (__DEV__) {
            const time = new Date().toLocaleTimeString();
            console.warn(`[${time}] [${tag}] ${message}`, data ? data : '');
        }
        listeners.forEach(fn => fn('warn', tag, message, data));
    },

    /**
     * 에러
     * @param tag 태그; `LogTag` 참고
     * @param message 에러 메시지
     * @param error 에러 StackTrace
     */
    error: (tag: LogTag, message: string, error?: any) => {
        if (__DEV__) {
            const time = new Date().toLocaleTimeString();
            const serializedError = serializeError(error);
            console.error(`[${time}] [${tag}] ${message}`, serializedError);
        }
        listeners.forEach(fn => fn('error', tag, message, undefined, error));
    },
};
