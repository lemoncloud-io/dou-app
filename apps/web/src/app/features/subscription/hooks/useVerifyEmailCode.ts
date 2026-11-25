import { useCallback } from 'react';

import { runtime } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import { useCustomMutation } from '@chatic/shared';

import { IS_DEV } from '../consts';
import { isEmailAlreadyRegistered } from '../lib';

import type { CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';

export interface EmailVerifyRequest {
    email: string;
    step: 'send' | 'resend' | 'check' | 'confirm';
    code?: string;
    cloudId?: string;
}

const useVerifyEmail = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<CloudVerifyEmailView, string, CloudVerifyEmailBody>(body =>
        cloud.verifyCloudEmail(body, { ...(IS_DEV && body.step === 'confirm' && { dryRun: true }) })
    );
};

export const useVerifyEmailCode = (): ((request: EmailVerifyRequest) => Promise<void>) => {
    const verifyEmail = useVerifyEmail();

    return useCallback(
        async (request: EmailVerifyRequest) => {
            try {
                await verifyEmail.mutateAsync(request);
            } catch (error) {
                const entry = {
                    error,
                    data: { step: request.step, hasCode: !!request.code, hasCloudId: !!request.cloudId },
                };
                const message = `email verification failed at step=${request.step}`;
                const sending = request.step === 'send' || request.step === 'resend';
                if (sending && isEmailAlreadyRegistered(error)) logger.warn('ACCOUNT', message, entry);
                else logger.error('ACCOUNT', message, entry);
                throw error;
            }
        },
        [verifyEmail]
    );
};
