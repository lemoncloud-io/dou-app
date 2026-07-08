import type { WebMessageData } from '@chatic/app-messages';
import type { LogListener } from '@chatic/logger';

import { NativeBridgeAdapter } from '../web/adapters';
import { safeSerializable } from './utils/safeSerializable';

/**
 * Creates a hub listener that forwards log entries to the native app via the
 * `SendLog` bridge message. The payload stays identical to the legacy adapter
 * format; the native side stamps its own receive timestamp.
 */
export const createNativeForwarder = (): LogListener => {
    const adapter = new NativeBridgeAdapter();

    return entry => {
        const message: WebMessageData<'SendLog'> = {
            type: 'SendLog',
            data: {
                level: entry.level,
                tag: entry.tag,
                message: entry.message,
                data: safeSerializable(entry.data),
                error: safeSerializable(entry.error),
            },
        };

        adapter.postMessage(message);
    };
};
