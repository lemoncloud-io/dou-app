import type { WebMessageData } from '@chatic/app-messages';

import { NativeBridgeAdapter } from '../../web/adapters';
import { safeSerializable } from '../utils/safeSerializable';
import type { LogAdapter, LogEntry } from '../types';

export const createNativeBridgeAdapter = (): LogAdapter => {
    const adapter = new NativeBridgeAdapter();

    return {
        log(entry: LogEntry): void {
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
        },
    };
};
