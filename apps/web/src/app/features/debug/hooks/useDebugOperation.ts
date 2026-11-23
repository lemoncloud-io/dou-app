import { useCallback, useState } from 'react';

import { logger } from '@chatic/bridges';

import { useDebugSharedStrings } from '../i18n/screens/shared';

export interface DebugOperation {
    result: string | null;
    run: (label: string, operation: () => Promise<unknown>) => Promise<void>;
    fire: (label: string, operation: () => void) => void;
}

const MAX_RESULT_CHARS = 400;

export const useDebugOperation = (): DebugOperation => {
    const [result, setResult] = useState<string | null>(null);
    const strings = useDebugSharedStrings();

    const run = useCallback(
        async (label: string, operation: () => Promise<unknown>) => {
            setResult(`${label}…`);
            try {
                const response = (await operation()) as { data?: unknown };
                const body = response?.data ? JSON.stringify(response.data).slice(0, MAX_RESULT_CHARS) : 'ok';
                setResult(`${label} → ${body}`);
            } catch (e) {
                logger.warn('APP', `debug operation failed: ${label}`, e as Error);
                setResult(`${label} → ${strings.operation.failedPrefix}: ${(e as Error).message}`);
            }
        },
        [strings]
    );

    const fire = useCallback(
        (label: string, operation: () => void) => {
            operation();
            setResult(`${label} → ${strings.operation.sentNoConfirmation}`);
        },
        [strings]
    );

    return { result, run, fire };
};
