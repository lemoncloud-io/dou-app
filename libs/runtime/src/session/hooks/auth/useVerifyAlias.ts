import { logger } from '@chatic/bridges';
import { useCustomMutation } from '@chatic/shared';
import { verifyAlias } from '@chatic/runtime-client';
import type { VerifyAliasBody, VerifyAliasView } from '@chatic/runtime-client';
import type { AxiosError } from 'axios';

export const useVerifyAlias = () =>
    useCustomMutation<VerifyAliasView, AxiosError, VerifyAliasBody>(async body => {
        try {
            return await verifyAlias(body);
        } catch (error) {
            logger.error('ACCOUNT', `alias verification failed (mode=${body.mode}, step=${body.step})`, {
                error,
                data: {
                    mode: body.mode,
                    step: body.step,
                    hasCode: !!body.code,
                    hasPassword: !!body.password,
                },
            });
            throw error;
        }
    });
