import { useMemo } from 'react';

import { bootSplashService } from '../../services';
import { createBootSplashHandlers } from './bootSplashHandlers';

export const useBootSplashHandler = () => useMemo(() => createBootSplashHandlers(bootSplashService), []);
