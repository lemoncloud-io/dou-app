import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

export interface EnsureCloudSession {
    /** The cloud in the URL is the live session — reads and writes that need its socket may go. */
    isReady: boolean;
    /** A switch into it is in flight (or about to start). */
    isSwitching: boolean;
    /** The switch failed; `retry` tries once more. */
    error: unknown;
    retry: () => void;
}

/**
 * Makes the cloud a management screen is about the ACTIVE session, switching into it if it is not.
 *
 * Cloud management addresses a cloud by URL, but two of its screens can only work through that
 * cloud's own session: the rename goes over its socket (`cloud.update`), and the place list is
 * that cloud's cache, filled by that cloud's sync. The relay has neither — it holds the catalog
 * row and nothing below it — so a screen that needs more switches first, the same way an invite
 * does, and keeps the user there afterwards. The switch is the whole app's switch, not a private
 * one for the screen: leaving the screen does not switch back.
 *
 * One attempt per cloud id. `isCloudActive` can read false for a beat while the switch commits,
 * and re-running on every render in that window would start a second switch over the first.
 */
export const useEnsureCloudSession = (cloudId: string | undefined): EnsureCloudSession => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { isCloudActive } = runtime.session.useRuntimeProfile();
    const { switchCloud, isPending } = runtime.session.useSwitchCloudSession();

    const [error, setError] = useState<unknown>(null);
    // Bumped by `retry` so the effect runs again for the same cloud id.
    const [attempt, setAttempt] = useState(0);
    const attemptedFor = useRef<string | null>(null);

    const isReady = !!cloudId && selectedCloudId === cloudId && isCloudActive;

    useEffect(() => {
        // A switch already in flight (the sheet's, say) owns the mutation key; this one waits for
        // it to settle and then judges again — two concurrent switches would race the commit.
        if (!cloudId || isReady || isPending || attemptedFor.current === cloudId) return;
        attemptedFor.current = cloudId;
        setError(null);
        switchCloud(cloudId).catch((e: unknown) => {
            // The session service records the rollback; this is the screen's own trace, so a
            // management screen that stays blank has an entry naming which cloud it waited on.
            logger.warn('CLOUD', 'cloud management could not enter the cloud', { error: e, data: { cloudId } });
            setError(e);
        });
    }, [cloudId, isReady, isPending, switchCloud, attempt]);

    const retry = useCallback(() => {
        attemptedFor.current = null;
        setError(null);
        setAttempt(n => n + 1);
    }, []);

    return {
        isReady,
        isSwitching: !isReady && !error && (isPending || !!cloudId),
        error,
        retry,
    };
};
