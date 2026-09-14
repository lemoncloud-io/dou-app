import { logger } from '@chatic/bridges';
import { useCustomMutation } from '@chatic/shared';
import { findAlias } from '../../auth/authActions';
import type { FindAliasBody, FindAliasView } from '../../auth/authActions';
import type { AxiosError } from 'axios';

/**
 * "Does an account exist for this address" — the first step of password reset.
 *
 * A failure here strands the user at the very start of the flow, and the screen turns it into a
 * generic toast. Neither the address nor the answer is recorded: the address is the user's, and
 * whether an account exists is precisely the fact an enumeration attempt is after (ADR-0075).
 */
export const useFindAlias = () =>
    useCustomMutation<FindAliasView, AxiosError, FindAliasBody>(async body => {
        try {
            return await findAlias(body);
        } catch (error) {
            logger.error('ACCOUNT', 'alias lookup failed', { error, data: { type: body.type } });
            throw error;
        }
    });
