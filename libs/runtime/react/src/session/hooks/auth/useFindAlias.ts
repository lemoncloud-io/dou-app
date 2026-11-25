import { logger } from '@chatic/bridges';
import { useCustomMutation } from '@chatic/shared';
import { findAlias } from '@chatic/runtime-client';
import type { FindAliasBody, FindAliasView } from '@chatic/runtime-client';
import type { AxiosError } from 'axios';

export const useFindAlias = () =>
    useCustomMutation<FindAliasView, AxiosError, FindAliasBody>(async body => {
        try {
            return await findAlias(body);
        } catch (error) {
            logger.error('ACCOUNT', 'alias lookup failed', { error, data: { type: body.type } });
            throw error;
        }
    });
