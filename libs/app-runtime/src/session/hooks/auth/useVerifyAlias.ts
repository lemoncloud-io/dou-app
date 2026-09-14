import { logger } from '@chatic/bridges';
import { useCustomMutation } from '@chatic/shared';
import { verifyAlias } from '../../auth/authActions';
import type { VerifyAliasBody, VerifyAliasView } from '../../auth/authActions';
import type { AxiosError } from 'axios';

/**
 * The email exchange behind sign-up and password reset.
 *
 * Every leg of both flows goes through here — six screens and eight call sites, each of which
 * catches the rejection and raises a toast, so a failure reached the user and nothing else. The
 * entry is placed on the hook rather than at those sites for that reason: the flows share one
 * mutation, and a new screen cannot forget to record its failures.
 *
 * `mode` and `step` are the whole point. One endpoint serves send / resend / check / change /
 * confirm across two different journeys, so without them a failure says only "email verification
 * broke" and not which leg of which flow — and "코드가 안 와요" and "코드를 넣어도 안 돼요" are
 * different bugs. The address, the code and the password are never recorded (ADR-0075).
 */
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
