import { logger } from '@chatic/logger';

import type { MessageProtocol, AnyBridgeMessage } from './types';

/**
 * The default JSON-based serialization/deserialization protocol implementation.
 */
export const JsonProtocol: MessageProtocol = {
    encode: message => JSON.stringify(message),

    decode: data => {
        try {
            // Convert to a string when the data arrives as binary (Uint8Array) (React Native compatibility, etc.)
            const text = data instanceof Uint8Array ? new TextDecoder('utf-8').decode(data) : data;

            return JSON.parse(text) as AnyBridgeMessage;
        } catch (error) {
            // In a webview environment, an external script (a browser extension, etc.) can inject
            // a malformed event, so this must be caught.
            // That's why this is `debug`, not `error` — most of these are noise that isn't our
            // fault (an event injected by an extension), and not worth recording on the server.
            // debug is dropped by both persistent sinks, so it never shows up in a release and is
            // only visible in the dev console. If one of our own messages breaks here, that
            // surfaces separately as the caller never getting a response.
            logger.debug('BRIDGE', '[JsonProtocol] failed to decode message', { error });
            return null;
        }
    },
};
