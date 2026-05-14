import type { ILogService, LogListener, LogTag } from './types';

export class LogService implements ILogService {
    private readonly listeners = new Set<LogListener>();

    private notifyListeners(...args: Parameters<LogListener>) {
        this.listeners.forEach(listener => {
            try {
                listener(...args);
            } catch {
                console.warn(`Failed to listening log. ${JSON.stringify(listener)}`);
            }
        });
    }

    subscribe(listener: LogListener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    debug(tag: LogTag, message: string, data?: any): void {
        this.notifyListeners('debug', tag, message, data);
    }

    info(tag: LogTag, message: string, data?: any): void {
        this.notifyListeners('info', tag, message, data);
    }

    warn(tag: LogTag, message: string, data?: any): void {
        this.notifyListeners('warn', tag, message, data);
    }

    error(tag: LogTag, message: string, error?: any): void {
        this.notifyListeners('error', tag, message, undefined, error);
    }
}
