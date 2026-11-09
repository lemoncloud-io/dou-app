import { useCallback, useState } from 'react';

import { logger } from '@chatic/bridges';

import { useDebugSharedStrings } from '../i18n/screens/shared';

/**
 * The "press a button, the app does it, show what came back" loop every migrated screen needs
 * (ADR-0080 decision 11). Extracted after the third copy of it.
 *
 * Two callers, because the bridge has two answer shapes and conflating them would let a screen
 * claim a confirmation it never got (decision 10):
 *
 * - `run` — for `webClient.request` commands. The app answers, so the line reports the response, and
 *   a rejection reports the failure.
 * - `fire` — for `webClient.post` commands (`openURL`, `setBadgeCount`, `openSettings`,
 *   `openShareSheet`). Nothing comes back, so the line says so instead of implying success.
 */
export interface DebugOperation {
    /** Last line to show under the buttons; null before anything ran. */
    result: string | null;
    /**
     * @param label what to call the operation in the result line.
     * @param operation the bridge call.
     */
    run: (label: string, operation: () => Promise<unknown>) => Promise<void>;
    fire: (label: string, operation: () => void) => void;
}

/** How much of a response to show — enough to read, short enough not to push the buttons offscreen. */
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
