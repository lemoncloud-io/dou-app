import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

import { DEBUG_SCREENS, type DebugScreenKey } from './screenManifest';

export const DEBUG_SCREEN_COMPONENTS = Object.fromEntries(
    DEBUG_SCREENS.map(screen => [screen.key, lazy(screen.load)])
) as Record<DebugScreenKey, LazyExoticComponent<ComponentType>>;
