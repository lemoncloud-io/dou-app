import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { readInviteLink } from '@chatic/shared';

import { buildEncodedInviteEntryParams } from '../features/invite/utils/buildEncodedInviteEntryParams';
import { ROUTES } from './paths';

export const EncodedLinkRedirect = (): JSX.Element => {
    const { search } = useLocation();

    let target: string = ROUTES.root;
    try {
        target = `${ROUTES.root}?${buildEncodedInviteEntryParams(search).toString()}`;
    } catch (error) {
        const { failedAt, length, ignoredChars } = readInviteLink(
            `/i${search.startsWith('?') ? search : `?${search}`}`
        );
        logger.warn('DEEPLINK', '[EncodedLinkRedirect] unreadable encoded invite link, falling back to root', {
            error,
            failedAt,
            length,
            ignoredChars,
        });
    }

    return <Navigate to={target} replace />;
};
