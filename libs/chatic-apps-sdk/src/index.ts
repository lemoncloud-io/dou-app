export {
    connect,
    type Capability,
    type ChaticApps,
    type ConnectOptions,
    type ChaticAppsPermissions,
    type LinkParams,
    type ShareContent,
    type ShareOutcome,
} from './chaticApps';
export type {
    AppErrorCode,
    ChaticAppsContext,
    CloseTrigger,
    DeviceKind,
    HapticKind,
    PermissionState,
    StorageUsage,
    Theme,
} from './types';
export type { ChaticAppsStorage } from './storage';
export { SDK_BRIDGE_VERSION } from './client';
export { ChaticAppsError, type ChaticAppsErrorCode } from './errors';
export { isInApp } from './transport';
