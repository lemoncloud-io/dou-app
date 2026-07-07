import { useCallback, useState } from 'react';

import { logger } from '@chatic/bridges';
import { reportError, useLogin } from '@chatic/web-core';

import { toError } from '../../../shared';

/**
 * Debug-only email/password sign-in (mirrors apps/web DebugLoginPage): exchange
 * credentials for a token via `useLogin`, which builds relay credentials and
 * hydrates the session internally. Bypasses the invite-code flow — intended for
 * local development, surfaced only in dev builds.
 */
export const useDebugLogin = () => {
    const { mutateAsync: login, isPending } = useLogin();
    const [isError, setIsError] = useState(false);

    const submit = useCallback(
        async (uid: string, pwd: string): Promise<boolean> => {
            setIsError(false);
            try {
                // loginRelayUser builds credentials and hydrates the session internally.
                await login({ uid, pwd });
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useDebugLogin] login failed', { error: err });
                reportError(err);
                setIsError(true);
                return false;
            }
        },
        [login]
    );

    return { submit, isSubmitting: isPending, isError };
};
