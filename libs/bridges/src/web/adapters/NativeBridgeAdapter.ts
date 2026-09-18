import { logger } from '@chatic/logger';

import type { BridgeAdapter } from './types';
import type { EventMessage, RequestMessage, ResponseMessage, MessageProtocol } from '../../common';
import { JsonProtocol } from '../../common';

/**
 * A production bridge adapter implementation that exchanges messages with the real native app
 * in a mobile native WebView environment (React Native WebView, iOS WebKit, Android WebView, etc.).
 */
export class NativeBridgeAdapter implements BridgeAdapter {
    /** The set of callback handlers that process incoming messages */
    private handlers = new Set<(message: ResponseMessage | EventMessage) => void>();
    /** The protocol engine for message serialization/deserialization */
    private protocol: MessageProtocol;
    /** The window/document event listener registration state flag */
    private isListening = false;

    constructor(protocol: MessageProtocol = JsonProtocol) {
        this.protocol = protocol;
    }

    /**
     * [Internal] Subscribes to the DOM's 'message' event to start watching for messages coming up from native.
     */
    private setupListener() {
        if (!this.isListening && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('message', this.handleNativeMessage);
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                document.addEventListener('message', this.handleNativeMessage as EventListener);
            }
            this.isListening = true;
        }
    }

    /**
     * [Internal] Tears down the event listener once there's no handler left to watch for messages.
     */
    private teardownListener() {
        if (this.isListening && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('message', this.handleNativeMessage);
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('message', this.handleNativeMessage as EventListener);
            }
            this.isListening = false;
        }
    }

    /**
     * [Internal] Parses and validates an event sent from native over the WebView channel, then routes it to every registered handler.
     */
    private handleNativeMessage = (event: MessageEvent) => {
        try {
            const data = event.data;
            // Ignore it if it isn't in the bridge communication data spec (string or binary).
            if (typeof data !== 'string' && !(data instanceof Uint8Array)) return;

            const parsed = this.protocol.decode(data);
            // Dispatch to the handlers only when it's a valid bridge message data spec.
            if (parsed && 'type' in parsed && typeof parsed.type === 'string') {
                this.handlers.forEach(handler => handler(parsed as ResponseMessage | EventMessage));
            }
        } catch (e) {
            // `decode` swallows its own parse failures (returns null), so what lands
            // here is a receiving handler that threw — app code, worth a breadcrumb.
            // Safe to log through the logger: this is the inbound path, so it never
            // re-enters `postMessage` the way the outbound path would.
            logger.error('BRIDGE', '[NativeBridgeAdapter] inbound handler threw', { error: e });
        }
    };

    /**
     * [Web -> App] JSON-serializes the message and sends it to the native interface mapped to the device environment.
     *
     * **The diagnostics inside this method must go through `console`, not `logger`.** On native,
     * `createNativeForwarder` calls this method for every log entry — calling `logger` in here
     * would infinitely recurse: log → forwarder → postMessage → failure → log. When the send
     * itself fails, there is no way to get that fact across the bridge in the first place, so the
     * console is the only place it can go. (The inbound path, `handleNativeMessage`, has no such
     * constraint and uses logger.)
     */
    public postMessage(message: RequestMessage): void {
        try {
            const encoded = this.protocol.encode(message);

            if (typeof encoded !== 'string') {
                console.warn('[NativeBridgeAdapter] this bridge only sends string payloads');
                return;
            }

            if (typeof window !== 'undefined') {
                // 1. Check for and send via the Android custom interface
                if (window.ChaticMessageHandler?.postMessage) {
                    window.ChaticMessageHandler.postMessage(encoded);
                }
                // 2. Check for and send via the iOS/macOS WebKit MessageHandler
                else if (window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage) {
                    window.webkit.messageHandlers.ChaticMessageHandler.postMessage(encoded);
                }
                // 3. Check for and send via the React Native WebView postMessage channel
                else if (window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(encoded);
                }
                // 4. Warn if native environment detection fails
                else {
                    console.warn('[NativeBridgeAdapter] no native bridge interface found');
                }
            } else {
                console.warn('[NativeBridgeAdapter] SSR environment exposes no native bridge interface');
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] failed to encode message:', e);
        }
    }

    /**
     * [App -> Web] Registers the receiving callback (handler) that processes messages sent from native.
     * The DOM message listener starts automatically the moment the first handler is registered.
     */
    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handlers.add(handler);
        if (this.handlers.size === 1) this.setupListener();

        return () => {
            this.handlers.delete(handler);
            if (this.handlers.size === 0) this.teardownListener();
        };
    }
}
