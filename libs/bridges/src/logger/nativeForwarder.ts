import type { WebMessageData } from '@chatic/bridge-messages';
import { isTelemetryEntry } from '@chatic/logger';

import type { LogEntry, LogListener } from '@chatic/logger';

import { NativeBridgeAdapter } from '../web/adapters';
import { toAppLogInfo } from './appLogInfoCodec';

const REPEAT_WINDOW_MS = 1_000;

const REPEAT_THRESHOLD = 5;

const MAX_TRACKED_LINES = 64;

const appConsoleEnabled = (): boolean =>
    (globalThis as { CHATIC_APP_CONSOLE_ENABLED?: boolean }).CHATIC_APP_CONSOLE_ENABLED === true;

const repeatKey = (entry: LogEntry): string => `${entry.level}|${entry.tag}|${entry.message}`;

export const createNativeForwarder = (): LogListener => {
    const adapter = new NativeBridgeAdapter();

    const recent = new Map<string, { firstAt: number; count: number }>();

    const send = (entry: LogEntry, messageOverride?: string): void => {
        const message: WebMessageData<'SendLog'> = {
            type: 'SendLog',
            data: { ...toAppLogInfo(entry), message: messageOverride ?? entry.message },
        };

        adapter.postMessage(message);
    };

    return entry => {
        if (entry.level === 'debug' && !appConsoleEnabled()) return;

        if (isTelemetryEntry(entry)) {
            send(entry);
            return;
        }

        const key = repeatKey(entry);
        const now = entry.timestamp;
        const seen = recent.get(key);

        if (seen && now - seen.firstAt < REPEAT_WINDOW_MS) {
            seen.count += 1;
            if (seen.count > REPEAT_THRESHOLD) return;
            send(entry);
            return;
        }

        if (seen && seen.count > REPEAT_THRESHOLD) {
            send(entry, `${entry.message} (+${seen.count - REPEAT_THRESHOLD} identical suppressed)`);
        }

        if (recent.size >= MAX_TRACKED_LINES) recent.clear();
        recent.set(key, { firstAt: now, count: 1 });
        send(entry);
    };
};
