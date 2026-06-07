import { useCallback, useState } from 'react';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';
import { login } from '@chatic/auth';
import { cloudCore, reportError, startWebCoreInit, toError, useWebCoreStore, webCore } from '@chatic/web-core';

/**
 * Debug-only email/password sign-in (mirrors apps/web DebugLoginPage): exchange
 * credentials for a token, build webCore credentials, clear any prior cloud
 * session, then mark authenticated. Bypasses the invite-code flow — intended for
 * local development, surfaced only in dev builds.
 */
export const useDebugLogin = () => {
    const { setProfile, setIsAuthenticated } = useWebCoreStore();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isError, setIsError] = useState(false);

    const submit = useCallback(
        async (uid: string, pwd: string): Promise<boolean> => {
            setIsSubmitting(true);
            setIsError(false);
            try {
                await startWebCoreInit();
                const { Token, ...rest } = await login({ uid, pwd });
                await webCore.buildCredentialsByToken(Token as Parameters<typeof webCore.buildCredentialsByToken>[0]);
                cloudCore.clearSession();
                setProfile(rest as unknown as UserProfile$);
                setIsAuthenticated(true);
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useDebugLogin] login failed', { error: err });
                reportError(err);
                setIsError(true);
                return false;
            } finally {
                setIsSubmitting(false);
            }
        },
        [setProfile, setIsAuthenticated]
    );

    return { submit, isSubmitting, isError };
};
