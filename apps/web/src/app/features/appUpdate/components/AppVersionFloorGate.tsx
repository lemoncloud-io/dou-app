import { useEffect, useState, type ReactNode } from 'react';

import { logger } from '@chatic/bridges';

import { isBelowAppVersionFloor, readShellVersion } from '../lib/appVersionFloor';
import { RequiredUpdateScreen } from './RequiredUpdateScreen';

export const AppVersionFloorGate = ({ children }: { children: ReactNode }) => {
    const [below] = useState(() => isBelowAppVersionFloor(readShellVersion()));
    useEffect(() => {
        if (below) logger.info('VERSION', 'app below the version floor; showing the update screen', readShellVersion());
    }, [below]);
    return below ? <RequiredUpdateScreen /> : <>{children}</>;
};
