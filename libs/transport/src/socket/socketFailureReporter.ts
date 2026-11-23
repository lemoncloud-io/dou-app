import { logger, type ObservationData } from '@chatic/logger';

import { getSocketErrorCode } from './utils/socketErrorCode';

import type { SlotKey } from './types';
import { kindOf } from './utils/slotKey';

export type SocketFailureClass = 'unavailable' | 'timeout' | 'server';

const classify = (code: number | undefined): SocketFailureClass => {
    if (code === 503 || code === 499) return 'unavailable';
    if (code === 408) return 'timeout';
    return 'server';
};

const ABSENCE_ANSWERS: Readonly<Record<string, number>> = {
    'profile.get': 404,
};

export interface ISocketFailureReporter {
    recordFailure(key: SlotKey, action: string, type: string, error: unknown): void;
    recordSuccess(key: SlotKey): void;
    forget(key: SlotKey): void;
    reset(): void;
}

class SocketFailureReporter implements ISocketFailureReporter {
    private static readonly STUCK_THRESHOLD = 5;

    private readonly streaks = new Map<SlotKey, number>();

    recordFailure(key: SlotKey, action: string, type: string, error: unknown): void {
        const code = getSocketErrorCode(error);
        const failure = classify(code);
        const kind = kindOf(key);

        if (failure === 'unavailable') {
            this.recordUnavailable(key, type, code, error);
            return;
        }

        this.streaks.set(key, 0);

        if (failure === 'timeout') {
            logger.warn('SOCKET', `socket request timed out — ${kind}.${action}(${type})`, {
                error,
                data: { kind, cid: key, action, type, code },
            });
            return;
        }

        if (code !== undefined && ABSENCE_ANSWERS[type] === code) {
            logger.info('SOCKET', `${code} socket request found nothing — ${kind}.${action}(${type})`, {
                error,
                data: { kind, cid: key, action, type, code },
            });
            return;
        }

        logger.error('SOCKET', `${code ?? 'unclassified'} socket request failed — ${kind}.${action}(${type})`, {
            error,
            data: { kind, cid: key, action, type, code },
        });
    }

    recordSuccess(key: SlotKey): void {
        const streak = this.streaks.get(key) ?? 0;
        if (streak === 0) return;

        this.streaks.set(key, 0);
        logger.info('SOCKET', `socket requests recovered — ${kindOf(key)}`, {
            data: {
                observation: 'socket-unavailable-streak',
                kind: kindOf(key),
                cid: key,
                afterFailures: streak,
            } satisfies ObservationData,
        });
    }

    forget(key: SlotKey): void {
        this.streaks.delete(key);
    }

    reset(): void {
        this.streaks.clear();
    }

    private recordUnavailable(key: SlotKey, type: string, code: number | undefined, error: unknown): void {
        const next = (this.streaks.get(key) ?? 0) + 1;
        this.streaks.set(key, next);
        const kind = kindOf(key);

        const data = {
            observation: 'socket-unavailable-streak',
            kind,
            cid: key,
            type,
            code,
            streak: next,
        } satisfies ObservationData;

        if (next === 1) {
            logger.warn('SOCKET', `socket request lost — no ${kind} connection`, { error, data });
            return;
        }

        if (next === SocketFailureReporter.STUCK_THRESHOLD) {
            logger.error('SOCKET', `${next} socket requests lost — ${kind} connection is not coming back`, {
                error,
                data,
            });
        }
    }
}

export const socketFailureReporter: ISocketFailureReporter = new SocketFailureReporter();
