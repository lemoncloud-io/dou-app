import { useMemo } from 'react';

import { HapticBridge } from '../../bridge';
import { createHapticHandlers } from './hapticHandlers';

export const useHapticHandler = () => useMemo(() => createHapticHandlers(HapticBridge), []);
