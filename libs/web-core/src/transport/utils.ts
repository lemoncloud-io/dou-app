import { classifyError, handleAuthError } from './error';
import { logger } from '@chatic/bridges';
import { createAsyncDelay } from '@lemoncloud/lemon-web-core';

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

export const withRetry = async <T>(operation: () => Promise<T>, maxRetries = 4, context = 'API call'): Promise<T> => {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const classification = classifyError(error);
            // 인증 에러
            if (classification.shouldLogout) {
                handleAuthError(error, true, `${context} - ${classification.message}`);
            }
            // 재시도 불가능한 에러는 즉시 실패
            if (!classification.shouldRetry) {
                logger.error('API', `${context} failed`, { error, data: { message: classification.message } });
                throw error;
            }
            // last try
            if (attempt === maxRetries) {
                logger.error('API', `${context} failed after ${maxRetries + 1} attempts`, {
                    error,
                    data: { message: classification.message },
                });
                throw error;
            }
            // retry with exponential backoff (1s, 2s, 4s, ...)
            const delay = Math.pow(2, attempt) * 1000;
            logger.warn('API', `${context} failed, retrying`, {
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
