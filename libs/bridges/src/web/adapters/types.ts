import type { EventMessage, RequestMessage, ResponseMessage } from '../../common';

/**
 * An adapter interface that abstracts the physical communication channel between the Web and App environments.
 * Implemented polymorphically as either the real native WebView channel (NativeBridgeAdapter) or the in-memory loopback channel for testing (InMemoryAdapter).
 */
export interface BridgeAdapter {
    /**
     * [Web -> App] Physically sends a message from the web to the app.
     * @param message The Request-spec message object to send
     */
    postMessage(message: RequestMessage): void;

    /**
     * [App -> Web] Registers an event listener (handler) to receive messages coming in from the app to the web.
     * @param handler The callback function that processes a Response or Event message delivered from the App
     * @returns A cleanup function that unsubscribes the registered handler
     */
    onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void;
}

declare global {
    interface Window {
        /** The message handler interface spec based on iOS/macOS WebKit */
        webkit?: {
            messageHandlers?: {
                ChaticMessageHandler?: {
                    postMessage: (message: string) => void;
                };
            };
        };
        /** The Android Chatic custom JavaScript interface spec */
        ChaticMessageHandler?: {
            postMessage?: (message: string) => void;
        };
        /** The React Native WebView built-in postMessage interface spec */
        ReactNativeWebView?: {
            postMessage(message: string): void;
        };
    }
}
