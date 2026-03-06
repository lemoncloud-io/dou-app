// Helper functions outside the Zustand store
import { useAppMessageStore } from '../stores';

import type { AppMessage, WebMessage } from '../types';

declare global {
    interface Window {
        CHATIC_APP_APPLICATION?: string;
        CHATIC_APP_PLATFORM?: string;
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
        webkit?: {
            messageHandlers?: {
                ChaticMessageHandler?: {
                    postMessage: (message: string) => void;
                };
            };
        };
        ChaticMessageHandler?: {
            receiveWebMessage?: (message: string) => void;
        };
    }
}

let isListenerInitialized = false;

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
    const application = window.CHATIC_APP_APPLICATION;
    const platform = window.CHATIC_APP_PLATFORM;

    const isOnMobileApp = application?.toLowerCase() === 'dou';
    const isIOS = platform?.toLowerCase() === 'ios';
    const isAOS = platform?.toLowerCase() === 'android';

    return { isOnMobileApp, isIOS, isAOS };
};

export const sendWebMessage = (message: WebMessage) => {
    if (!window.ReactNativeWebView) {
        console.log('sendMessage skipped (no ReactNativeWebView):', message);
        return;
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
};

export const sendIosMessage = (message: WebMessage) => {
    const messageHandler = window.webkit?.messageHandlers?.ChaticMessageHandler;
    if (!messageHandler) {
        return;
    }

    messageHandler.postMessage(JSON.stringify(message));
};

export const sendAosMessage = (message: WebMessage) => {
    const messageHandler = window.ChaticMessageHandler;
    if (!messageHandler) {
        return;
    }

    const receiveFunc = messageHandler.receiveWebMessage;
    if (!receiveFunc || typeof receiveFunc !== 'function') {
        return;
    }

    receiveFunc(JSON.stringify(message));
};

export const getIsWebView = () => {
    const { isOnMobileApp, isIOS, isAOS } = getMobileAppInfo();
    return { isWebView: isOnMobileApp, isIOS, isAOS };
};
