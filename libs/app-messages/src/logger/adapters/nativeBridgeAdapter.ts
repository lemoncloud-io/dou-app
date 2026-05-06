import { postMessage } from '../../utils';
import { safeSerializable } from '../utils/safeSerializable';
import type { LogAdapter, LogEntry } from '../types';

export const createNativeBridgeAdapter = (): LogAdapter => ({
    log(entry: LogEntry): void {
        postMessage({
            type: 'SendLog',
            data: {
                level: entry.level,
                tag: entry.tag,
                message: entry.message,
                data: safeSerializable(entry.data),
                error: safeSerializable(entry.error),
            },
        });
    },
});
