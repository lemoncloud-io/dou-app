import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

import type { DebugScreenKey } from './debugMenu';

// Screens are lazy so the always-mounted overlay host doesn't drag ~5k lines of
// debug tooling into the initial bundle (the old /debug routes were lazy too).
// The expanded sheet renders them inside a Suspense boundary.
export const DEBUG_SCREEN_COMPONENTS: Record<DebugScreenKey, LazyExoticComponent<ComponentType>> = {
    EmailLogin: lazy(() => import('./screens/EmailLoginScreen').then(m => ({ default: m.EmailLoginScreen }))),
    LogBuffer: lazy(() => import('./screens/LogBufferScreen').then(m => ({ default: m.LogBufferScreen }))),
    CacheTest: lazy(() => import('./screens/CacheTestScreen').then(m => ({ default: m.CacheTestScreen }))),
    UploadTest: lazy(() => import('./screens/UploadTestScreen').then(m => ({ default: m.UploadTestScreen }))),
    Push: lazy(() => import('./screens/PushScreen').then(m => ({ default: m.PushScreen }))),
    InviteRedirect: lazy(() =>
        import('./screens/InviteRedirectScreen').then(m => ({ default: m.InviteRedirectScreen }))
    ),
    DBBrowser: lazy(() => import('./screens/DBBrowserScreen').then(m => ({ default: m.DBBrowserScreen }))),
    ProfileEditor: lazy(() => import('./screens/ProfileEditorScreen').then(m => ({ default: m.ProfileEditorScreen }))),
    DeviceInfo: lazy(() => import('./screens/DeviceInfoScreen').then(m => ({ default: m.DeviceInfoScreen }))),
};
