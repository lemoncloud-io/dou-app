import { logger } from '@chatic/bridges';

let installed = false;

export const installGlobalErrorCapture = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', event => {
        const error = event.error ?? new Error(event.message);

        logger.error('GLOBAL', `[window.onerror] ${event.message}`, {
            error,
            data: {
                errorWasNull: event.error == null,
                filename: event.filename || undefined,
                lineno: event.lineno || undefined,
                colno: event.colno || undefined,
            },
        });
    });

    window.addEventListener('unhandledrejection', event => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

        logger.error('GLOBAL', `[unhandledrejection] ${error.message}`, { error });
    });
};
