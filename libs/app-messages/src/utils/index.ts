// Helper functions outside the Zustand store
import { useAppMessageStore } from '../stores';

import type { AppMessage, WebMessage } from '../types';

declare global {
    interface Window {
        CHATIC_APP_APPLICATION?: string;
        CHATIC_APP_PLATFORM?: string;
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
            const customEvent = event as CustomEvent<string>;
            const message: AppMessage = JSON.parse(customEvent.detail || (event as MessageEvent).data);
            useAppMessageStore.getState().handleMessage(message);
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };

    window.addEventListener('AppMessage', handleMessage as EventListener);
    isListenerInitialized = true;

    return () => {
        window.removeEventListener('AppMessage', handleMessage as EventListener);
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

    const isOnMobileApp = application?.toLowerCase() === 'chatic';
    const isIOS = platform === 'ios';
    const isAOS = platform === 'aos';

    return { isOnMobileApp, isIOS, isAOS };
};

export const sendWebMessage = (message: WebMessage) => {
    const { isOnMobileApp, isIOS, isAOS } = getMobileAppInfo();

    if (!isOnMobileApp) {
        console.log('sendMessage: ', message);
    }

    if (isIOS) {
        sendIosMessage(message);
        return;
    }

    if (isAOS) {
        sendAosMessage(message);
        return;
    }
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
