import { NativeEventEmitter, NativeModules } from 'react-native';
import { ingestLogEntry } from '@chatic/logger';
import type { LogLevel } from '@chatic/logger';

interface NativeLogEventPayload {
    level?: string;
    tag?: string;
    message?: string;
    timestamp?: number;
    error?: string;
}

const LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);

export const attachNativeLoggerBridge = (): (() => void) => {
    const nativeLogger = NativeModules.ChaticNativeLogger;
    if (!nativeLogger) return () => undefined;

    const emitter = new NativeEventEmitter(nativeLogger);
    const subscription = emitter.addListener('ChaticNativeLog', (payload: NativeLogEventPayload) => {
        ingestLogEntry({
            level: (LEVELS.has(payload.level ?? '') ? payload.level : 'info') as LogLevel,
            tag: payload.tag ?? 'NATIVE',
            message: payload.message ?? '',
            timestamp: payload.timestamp ?? Date.now(),
            ...(payload.error !== undefined ? { error: payload.error } : {}),
            source: 'native',
        });
    });
    nativeLogger.ready?.();

    return () => subscription.remove();
};
