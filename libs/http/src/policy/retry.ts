import { classifyError } from '../error/classify';

const delayFor = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const withTimeout = <T>(promise: Promise<T>, ms: number, context = 'Operation'): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`TIMEOUT: ${context} timed out (${ms}ms)`));
        }, ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};

export interface RetryAttemptEvent {
    attempt: number;
    maxAttempts: number;
    delay: number;
    message: string;
}

export interface RetryFailureEvent {
    error: unknown;
    message: string;
}

export interface RetryHooks {
    onAuthFailure?: (error: unknown, message: string) => void;
    onFatal?: (event: RetryFailureEvent) => void;
    onExhausted?: (event: RetryFailureEvent & { attempts: number }) => void;
    onRetry?: (event: RetryAttemptEvent) => void;
}

export const withRetry = async <T>(
    operation: () => Promise<T>,
    maxRetries = 4,
    context = 'API call',
    hooks: RetryHooks = {}
): Promise<T> => {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const classification = classifyError(error);
            if (classification.shouldLogout) {
                hooks.onAuthFailure?.(error, `${context} - ${classification.message}`);
            }
            if (!classification.shouldRetry) {
                hooks.onFatal?.({ error, message: classification.message });
                throw error;
            }
            if (attempt === maxRetries) {
                hooks.onExhausted?.({ error, message: classification.message, attempts: attempt + 1 });
                throw error;
            }
            const delay = Math.pow(2, attempt) * 1000;
            hooks.onRetry?.({
                attempt: attempt + 1,
                maxAttempts: maxRetries + 1,
                delay,
                message: classification.message,
            });
            await delayFor(delay);
        }
    }

    throw lastError;
};
