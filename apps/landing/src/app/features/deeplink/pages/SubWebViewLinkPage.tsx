import { type JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { readSubWebViewAppLink } from '@chatic/shared';

import { DeepLinkPage } from './DeepLinkPage';

export const SubWebViewLinkPage = (): JSX.Element => {
    const { origin, pathname, search } = window.location;
    return readSubWebViewAppLink(`${origin}${pathname}${search}`) ? (
        <DeepLinkPage appOnly />
    ) : (
        <Navigate to="/" replace />
    );
};
