import type { JSX } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { buildInviteEntryParams } from '../features/invite/utils/buildInviteEntryParams';
import { ROUTES } from './paths';

export const ShareLinkRedirect = (): JSX.Element => {
    const { search } = useLocation();

    let target: string = ROUTES.root;
    try {
        target = `${ROUTES.root}?${buildInviteEntryParams(search).toString()}`;
    } catch (error) {
        logger.warn('DEEPLINK', '[ShareLinkRedirect] unconvertible share link, falling back to root', {
            search,
            error,
        });
    }

    return <Navigate to={target} replace />;
};
