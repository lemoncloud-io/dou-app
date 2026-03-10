// Helper functions outside the Zustand store
import { useAppMessageStore } from '../stores';

import type { AppMessage, WebMessage } from '../types';

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        webkit?: {
            messageHandlers?: {
                ChaticMessageHandler?: { postMessage: (message: string) => void };
            };
        };
        ChaticMessageHandler?: {
            postMessage?: (message: string) => void;
        };
        ReactNativeWebView?: { postMessage: (message: string) => void };
    }
}

let isListenerInitialized = false;

/**
 * - 메시지 수신 리스너
 * - 웹뷰 환경에서 앱으로부터 메시지를 수신하고 처리
 */
export const initializeMessageListener = () => {
    if (isListenerInitialized) {
        return;
    }
    const handleMessage = (event: Event) => {
        try {
            const data = (event as CustomEvent).detail ?? (event as MessageEvent).data;
            if (!data) return;
            const message: AppMessage = JSON.parse(data);
            useAppMessageStore.getState().handleMessage(message);
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };

    window.addEventListener('AppMessage', handleMessage as EventListener);
    window.addEventListener('message', handleMessage as EventListener);
    document.addEventListener('message', handleMessage as EventListener);
    isListenerInitialized = true;

    return () => {
        window.removeEventListener('AppMessage', handleMessage as EventListener);
        window.removeEventListener('message', handleMessage as EventListener);
        document.removeEventListener('message', handleMessage as EventListener);
        isListenerInitialized = false;
    };
};

/**
 * Centralized mobile app detection utility
 * @returns Object with mobile app detection flags
 */
export const getMobileAppInfo = () => {
    const platform = window.CHATIC_APP_PLATFORM?.toLowerCase();

    return {
        isIOS: platform === 'ios',
        isAndroid: platform === 'android',
    };
};

/**
 * 웹에서 앱으로 메시지 전송 (Web -> App)
 */
export const postMessage: (message: WebMessage) => void = (message: WebMessage) => {
    const messageStr = JSON.stringify(message);

    try {
        if (window.ChaticMessageHandler?.postMessage) {
            window.ChaticMessageHandler.postMessage(messageStr);
        } else if (window.webkit?.messageHandlers?.ChaticMessageHandler) {
            window.webkit.messageHandlers.ChaticMessageHandler.postMessage(messageStr);
        } else if (window.ReactNativeWebView?.postMessage) {
            window.ReactNativeWebView.postMessage(messageStr);
        }
    } catch (error) {
        console.error('[Bridge] Send Error:', error);
    }
};
