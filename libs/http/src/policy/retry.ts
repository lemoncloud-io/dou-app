import { createAsyncDelay } from '@lemoncloud/lemon-web-core';

import { classifyError } from '../error/classify';

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
    /**
     * Fired synchronously the moment classification says the request needs a logout — before the
     * fatal/exhausted checks below. Throwing here aborts the retry loop (the throw propagates out of
     * `withRetry`, matching the previous `handleAuthError` behavior); a hook that does not throw
     * lets the loop fall through to the ordinary shouldRetry check.
     */
    onAuthFailure?: (error: unknown, message: string) => void;
    /** A non-retryable classification (other than shouldLogout) short-circuited the loop. */
    onFatal?: (event: RetryFailureEvent) => void;
    /** The final attempt failed and no attempts remain. */
    onExhausted?: (event: RetryFailureEvent & { attempts: number }) => void;
    /** About to sleep and retry. */
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
            // 인증 에러
            if (classification.shouldLogout) {
                hooks.onAuthFailure?.(error, `${context} - ${classification.message}`);
            }
            // 재시도 불가능한 에러는 즉시 실패
            if (!classification.shouldRetry) {
                hooks.onFatal?.({ error, message: classification.message });
                throw error;
            }
            // last try
            if (attempt === maxRetries) {
                hooks.onExhausted?.({ error, message: classification.message, attempts: attempt + 1 });
                throw error;
            }
            // retry with exponential backoff (1s, 2s, 4s, ...)
            const delay = Math.pow(2, attempt) * 1000;
            hooks.onRetry?.({
                attempt: attempt + 1,
                maxAttempts: maxRetries + 1,
                delay,
                message: classification.message,
            });
            await createAsyncDelay(delay);
        }
    }

    throw lastError;
};
