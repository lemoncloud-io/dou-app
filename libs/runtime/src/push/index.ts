// The `push` facade group — device-token registration.
//
// The mutation lives under `data/hooks/` because it is a REST call; its one consumer is apps/web's push
// debug screen, which registers by hand. The runtime's own registration is runtime-core's
// `PushRegistration`, started by the hook below, and calls the gateway without React.
export { useDeviceTokenRegistration } from './hooks/useDeviceTokenRegistration';
export type { DeviceTokenDelegate } from './hooks/useDeviceTokenRegistration';
export { useRegisterDeviceTokenMutation } from '../data/hooks/device';

// Who receives notifications on this host — the push port's fields, as the entry point published them:
// `kind` is `'shell'` where the app registers and receives, `'browser'` where nothing does, and each
// member is what the app does for push, `null` where it does none of it. Live bindings, so they read the
// published answer; `kind` is `undefined` and a member throws on use until the entry point publishes.
export {
    pushKind as kind,
    pushNotifications as notifications,
    pushDeviceToken as deviceToken,
    pushTokenRenewal as tokenRenewal,
    pushLocalBanner as localBanner,
} from '@chatic/runtime-client';
