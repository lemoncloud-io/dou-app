import { useCallback, useState } from 'react';

import { logger } from '@chatic/bridges';

/**
 * The "press a button, the app does it, show what came back" loop every migrated screen needs
 * (ADR-0080 결정 11). Extracted after the third copy of it.
 *
 * Two callers, because the bridge has two answer shapes and conflating them would let a screen
 * claim a confirmation it never got (결정 10):
 *
 * - `run` — for `webClient.request` commands. The app answers, so the line reports the response, and
 *   a rejection (including an older app that does not know the command) reports the failure.
 * - `fire` — for `webClient.post` commands (`openURL`, `setBadgeCount`, `openSettings`,
 *   `openShareSheet`). Nothing comes back, so the line says so instead of implying success.
 *
 * ## Commands an older app does not know
 *
 * The web ships ahead of the app, so a panel built against a new command runs for a while on builds
 * that have no handler for it. The host answers `NOT_FOUND` in that case, which is NOT a failure of
 * the operation — it means nobody was listening. Reporting the host's raw message ("등록된 핸들러를
 * 찾을 수 없습니다: …") would send a tester chasing a bug that is really a version gap.
 *
 * So `run` takes the command name, says so plainly, and REMEMBERS: `isUnsupported(command)` lets a
 * screen disable the control instead of offering a button that cannot work. Module scope and
 * one-way, like `shellKvAdapter`'s `configKvUnsupported` and `NativeDBAdapter`'s
 * `batchReadUnsupported` — one installed app cannot gain a handler without a reload.
 */
export interface DebugOperation {
    /** Last line to show under the buttons; null before anything ran. */
    result: string | null;
    /**
     * @param label what to call the operation in the result line.
     * @param operation the bridge call.
     * @param command the message type, when the caller wants NOT_FOUND remembered for it.
     */
    run: (label: string, operation: () => Promise<unknown>, command?: string) => Promise<void>;
    fire: (label: string, operation: () => void) => void;
    /** Whether this app build already answered NOT_FOUND for that command. */
    isUnsupported: (command: string) => boolean;
}

/** Commands this app build has told us it does not know. Never un-learned — see the docblock. */
const unsupportedCommands = new Set<string>();

/** Test seam: the set is module state, so a suite that learns one must be able to forget it. */
export const resetUnsupportedCommands = (): void => unsupportedCommands.clear();

const isNotFound = (error: unknown): boolean => (error as { code?: string } | undefined)?.code === 'NOT_FOUND';

/** How much of a response to show — enough to read, short enough not to push the buttons offscreen. */
const MAX_RESULT_CHARS = 400;

export const useDebugOperation = (): DebugOperation => {
    const [result, setResult] = useState<string | null>(null);

    const run = useCallback(async (label: string, operation: () => Promise<unknown>, command?: string) => {
        setResult(`${label}…`);
        try {
            const response = (await operation()) as { data?: unknown };
            const body = response?.data ? JSON.stringify(response.data).slice(0, MAX_RESULT_CHARS) : 'ok';
            setResult(`${label} → ${body}`);
        } catch (e) {
            if (isNotFound(e)) {
                if (command) unsupportedCommands.add(command);
                // `info`, not `warn`: a version gap is expected during the deploy window, and the
                // uploader carries this line so the gap is visible in collected logs.
                logger.info('APP', `debug command unsupported by this app build: ${command ?? label}`);
                setResult(`${label} → 이 앱 버전이 지원하지 않습니다`);
                return;
            }
            logger.warn('APP', `debug operation failed: ${label}`, e as Error);
            setResult(`${label} → 실패: ${(e as Error).message}`);
        }
    }, []);

    const fire = useCallback((label: string, operation: () => void) => {
        operation();
        setResult(`${label} → 보냈습니다 (확인 없음)`);
    }, []);

    const isUnsupported = useCallback((command: string) => unsupportedCommands.has(command), []);

    return { result, run, fire, isUnsupported };
};
