import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

import { DEBUG_SCREENS, type DebugScreenKey } from './screenManifest';

/**
 * React half of the manifest. Screens are lazy so the always-mounted overlay host doesn't drag ~8k
 * lines of debug tooling into the initial bundle; the panel renders them inside a Suspense boundary.
 */
export const DEBUG_SCREEN_COMPONENTS = Object.fromEntries(
    DEBUG_SCREENS.map(screen => [screen.key, lazy(screen.load)])
) as Record<DebugScreenKey, LazyExoticComponent<ComponentType>>;
