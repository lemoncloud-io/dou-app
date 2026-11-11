import { useEffect, useState, type ReactNode } from 'react';

import { logger } from '@chatic/bridges';

import { isBelowAppVersionFloor, readShellVersion } from '../lib/appVersionFloor';
import { RequiredUpdateScreen } from './RequiredUpdateScreen';

/**
 * Renders the app, or — for a phone app below the floor — the update screen in its place. Read once:
 * the installed version cannot change while the page lives, and a check that flipped mid-session
 * would unmount everything under it.
 */
export const AppVersionFloorGate = ({ children }: { children: ReactNode }) => {
    const [below] = useState(() => isBelowAppVersionFloor(readShellVersion()));
    // The one record that an app was turned away: nothing else of the app runs to say so.
    useEffect(() => {
        if (below) logger.info('VERSION', 'app below the version floor; showing the update screen', readShellVersion());
    }, [below]);
    return below ? <RequiredUpdateScreen /> : <>{children}</>;
};
