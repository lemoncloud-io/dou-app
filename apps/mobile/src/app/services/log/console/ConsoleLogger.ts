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

        this.unsubscribeConsoleLog = this.logService.subscribe((level, tag, message, data, error) => {
            if (!this.isDev) return;

            const time = new Date().toLocaleTimeString();
            const prefix = `[${time}] [${tag}] ${message}`;

            if (level === 'error') {
                console.error(prefix, serializeError(error));
                return;
            }

            console[level](prefix, data ?? '');
        });
    }

    public teardown(): void {
        this.unsubscribeConsoleLog?.();
        this.unsubscribeConsoleLog = undefined;
    }
}
