import type { ILogService } from '../types';
import { serializeError } from '../utils';
import type { IConsoleLogger } from './types';

export class ConsoleLogger implements IConsoleLogger {
    private unsubscribeConsoleLog?: () => void;
    private readonly logService: ILogService;
    private readonly isDev: boolean;

    constructor(logService: ILogService, isDev: boolean = __DEV__) {
        this.logService = logService;
        this.isDev = isDev;
    }

    public init(): void {
        if (this.unsubscribeConsoleLog) return;

        this.unsubscribeConsoleLog = this.logService.subscribe(entry => {
            if (!this.isDev) return;

            // Occurrence time, not print time — bridged web entries keep their
            // original timestamp (ADR-0047).
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const prefix = `[${time}] [${entry.tag}] ${entry.message}`;

            // Error entries carry BOTH: `error` is the thrown value, `data` is the
            // structured context around it. Printing only the error dropped exactly
            // the diagnostic half — a failed request's status/errorCode/responseData
            // live in `data` (see withNetworkLog), so the console showed the request
            // but never why it failed. Mirrors the core console listener.
            if (entry.level === 'error') {
                console.error(prefix, serializeError(entry.error), entry.data ?? '');
                return;
            }

            console[entry.level](prefix, entry.data ?? '');
        });
    }

    public teardown(): void {
        this.unsubscribeConsoleLog?.();
        this.unsubscribeConsoleLog = undefined;
    }
}
