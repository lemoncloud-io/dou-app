import { logHub, logger as coreLogger } from '@chatic/logger';
import type { LogErrorOptions, LogListener } from '@chatic/logger';
import type { ILogService } from './types';

export class LogService implements ILogService {
    subscribe(listener: LogListener): () => void {
        return logHub.subscribe(listener);
    }

    debug(tag: string, message: string, data?: unknown): void {
        coreLogger.debug(tag, message, data);
    }

    info(tag: string, message: string, data?: unknown): void {
        coreLogger.info(tag, message, data);
    }

    warn(tag: string, message: string, data?: unknown): void {
        coreLogger.warn(tag, message, data);
    }

    error(tag: string, message: string, options?: LogErrorOptions | unknown): void {
        coreLogger.error(tag, message, options);
    }
}
