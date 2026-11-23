import { useCallback, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

import { toError } from '../../../shared';

export const useDebugLogin = () => {
    const { mutateAsync: login, isPending } = runtime.session.useLogin();
    const [isError, setIsError] = useState(false);

    const submit = useCallback(
        async (uid: string, pwd: string): Promise<boolean> => {
            setIsError(false);
            try {
                await login({ uid, pwd });
                return true;
            } catch (error) {
                const err = toError(error);
                logger.error('AUTH', '[useDebugLogin] login failed', { error: err });
                setIsError(true);
                return false;
            }
        },
        [login]
    );

    return { submit, isSubmitting: isPending, isError };
};
