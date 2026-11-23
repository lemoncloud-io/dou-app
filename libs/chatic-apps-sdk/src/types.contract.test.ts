import type {
    HapticKind as AppHapticKind,
    MiniAppLaunchParams as AppMiniAppLaunchParams,
    SubWebViewCloseTrigger,
    SubWebViewContext,
    SubWebViewDeviceKind,
    SubWebViewDevicePermissionState,
    SubWebViewPageErrorCode,
    SubWebViewStorageUsage,
    SubWebViewTheme,
} from '@chatic/bridge-messages';

import type {
    AppErrorCode,
    ChaticAppsContext,
    CloseTrigger,
    DeviceKind,
    HapticKind,
    MiniAppLaunchParams,
    PermissionState,
    StorageUsage,
    Theme,
} from './types';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const pinned: [
    Equal<ChaticAppsContext, SubWebViewContext>,
    Equal<HapticKind, AppHapticKind>,
    Equal<CloseTrigger, SubWebViewCloseTrigger>,
    Equal<Theme, SubWebViewTheme>,
    Equal<AppErrorCode, SubWebViewPageErrorCode>,
    Equal<StorageUsage, SubWebViewStorageUsage>,
    Equal<DeviceKind, SubWebViewDeviceKind>,
    Equal<PermissionState, SubWebViewDevicePermissionState>,
    Equal<MiniAppLaunchParams, AppMiniAppLaunchParams>,
] = [true, true, true, true, true, true, true, true, true];

describe('the public types', () => {
    it("match the app's message definitions exactly", () => {
        expect(pinned.every(Boolean)).toBe(true);
    });
});
