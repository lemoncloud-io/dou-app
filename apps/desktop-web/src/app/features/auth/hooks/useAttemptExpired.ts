import { useEffect, useState } from 'react';

import type { OAuthAttempt } from '../stores/useOAuthAttemptStore';
import { OAUTH_LOGIN_START_TTL_MS } from '../utils/oauthLoginStart';

/**
 * Whether the attempt's start record has run out, re-read when it does. An expired start refuses the
 * browser's return, so opening the browser again would only lead to a refusal.
 */
export const useAttemptExpired = (attempt: OAuthAttempt | null): boolean => {
    const [expired, setExpired] = useState(false);
    useEffect(() => {
        setExpired(false);
        if (attempt?.startedAt === undefined) return;
        const left = attempt.startedAt + OAUTH_LOGIN_START_TTL_MS - Date.now();
        if (left <= 0) {
            setExpired(true);
            return;
        }
        const timer = setTimeout(() => setExpired(true), left);
        return () => clearTimeout(timer);
    }, [attempt?.startedAt]);
    return expired;
};
