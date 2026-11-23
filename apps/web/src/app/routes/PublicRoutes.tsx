import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { useBootSplashHold } from '../runtime/bootSplash';
import { InviteEntryGate } from './InviteEntryGate';
import { ROUTES } from './paths';

const PublicRootEntry = (): JSX.Element => {
    useBootSplashHold();
    return <InviteEntryGate />;
};

export const publicRoutes = [
    { path: ROUTES.root, element: <PublicRootEntry /> },
    { path: '*', element: <Navigate to={ROUTES.root} replace /> },
];
