import type {
    HapticKind as AppHapticKind,
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
    PermissionState,
    StorageUsage,
    Theme,
} from './types';

// Exactly equal, both ways: a field added to, removed from or retyped in either side fails to compile,
// and ts-jest fails this file on a type error.
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
] = [true, true, true, true, true, true, true, true];

describe('the public types', () => {
    it("match the app's message definitions exactly", () => {
        expect(pinned.every(Boolean)).toBe(true);
    });
});
