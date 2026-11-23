import { logger } from '@chatic/logger';

import type { MessageProtocol, AnyBridgeMessage } from './types';

export const JsonProtocol: MessageProtocol = {
    encode: message => JSON.stringify(message),

    decode: data => {
        try {
            const text = data instanceof Uint8Array ? new TextDecoder('utf-8').decode(data) : data;

            return JSON.parse(text) as AnyBridgeMessage;
        } catch (error) {
            logger.debug('BRIDGE', '[JsonProtocol] failed to decode message', { error });
            return null;
        }
    },
};
