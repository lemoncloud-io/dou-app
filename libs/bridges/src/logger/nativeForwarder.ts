import type { WebMessageData } from '@chatic/app-messages';
import type { LogListener } from '@chatic/logger';

import { NativeBridgeAdapter } from '../web/adapters';
import { safeSerializable } from './utils/safeSerializable';

/**
 * Creates a hub listener that forwards log entries to the native app via the
 * `SendLog` bridge message. The original occurrence `timestamp` and
 * `source: 'web'` ride along so the native merged buffer keeps the web
 * entry's identity instead of restamping/retagging it (ADR-0047). Older app
 * builds simply ignore the extra fields.
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
                timestamp: entry.timestamp,
                source: 'web',
            },
        };

        adapter.postMessage(message);
    };
};
