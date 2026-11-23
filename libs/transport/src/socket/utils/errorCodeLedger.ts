import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';

const LEDGER_SIZE = 16;

export interface ErrorCodeLedger {
    observe(message: SocketMessage | undefined): void;
    attach(error: unknown): unknown;
}

const rejectionMessageOf = (message: SocketMessage): string =>
    `${message.error || 'socket request failed'} - ${message.type}`;

export const createErrorCodeLedger = (): ErrorCodeLedger => {
    const codes = new Map<string, number>();
    return {
        observe(message) {
            if (!message?.mid || !message.type?.endsWith(':error')) return;
            if (typeof message.errorCode !== 'number') return;
            const key = rejectionMessageOf(message);
            codes.delete(key);
            codes.set(key, message.errorCode);
            if (codes.size > LEDGER_SIZE) codes.delete(codes.keys().next().value as string);
        },
        attach(error) {
            if (!(error instanceof Error)) return error;
            const carrier = error as Error & { errorCode?: unknown };
            if (typeof carrier.errorCode === 'number') return error;
            const code = codes.get(error.message);
            if (code !== undefined) carrier.errorCode = code;
            return error;
        },
    };
};
