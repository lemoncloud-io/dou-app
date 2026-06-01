import { webClient } from '../index';

const isNative = (): boolean => {
    if (typeof window === 'undefined') return false;
    return !!(
        window.ReactNativeWebView?.postMessage ||
        window.ChaticMessageHandler?.postMessage ||
        window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
    );
};

/**
 * 하이브리드 앱 또는 콘솔에 디버그 로그를 전송하기 위한 브릿지 로거 유틸리티입니다.
 */
export const logger = {
    debug(tag: string, message: string, data?: any): void {
        if (isNative()) {
            webClient.post('SendLog', { data: { level: 'debug', tag, message, data } });
        } else {
            console.debug(`[${tag}] ${message}`, data || '');
        }
    },
    info(tag: string, message: string, data?: any): void {
        if (isNative()) {
            webClient.post('SendLog', { data: { level: 'info', tag, message, data } });
        } else {
            console.log(`[${tag}] ${message}`, data || '');
        }
    },
    warn(tag: string, message: string, data?: any): void {
        if (isNative()) {
            webClient.post('SendLog', { data: { level: 'warn', tag, message, data } });
        } else {
            console.warn(`[${tag}] ${message}`, data || '');
        }
    },
    error(tag: string, message: string, options?: { error?: any; data?: any }): void {
        if (isNative()) {
            webClient.post('SendLog', {
                data: {
                    level: 'error',
                    tag,
                    message,
                    data: options?.data,
                    error: options?.error ? String(options.error) : undefined,
                },
            });
        } else {
            console.error(`[${tag}] ${message}`, options?.error || '', options?.data || '');
        }
    },
};
