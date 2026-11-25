import type { JSX } from 'react';
import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';

import { CloudInviteAccept, InviteAcceptLoading, RelayInviteAccept } from './components';
import { isInviteEntry, isRelayInvite, parseInviteDeeplink } from './types';
import { useBackHandler } from '../../../hooks/useBackHandler';
import { ROUTES } from '../../../routes/paths';

export const InviteAcceptPage = (): JSX.Element => {
    useBackHandler();

    const { search } = useLocation();
    const params = useMemo(() => parseInviteDeeplink(search), [search]);
    const { isAuthenticated } = runtime.session.useSessionAuth();

    if (!isInviteEntry(params)) return <Navigate to={ROUTES.root} replace />;

    return (
        <div className="flex h-dvh w-full flex-col items-center bg-background">
            {!isAuthenticated ? (
                <InviteAcceptLoading />
            ) : isRelayInvite(params) ? (
                <RelayInviteAccept code={params.code as string} />
            ) : (
                <CloudInviteAccept params={params} />
            )}
        </div>
    );
};
