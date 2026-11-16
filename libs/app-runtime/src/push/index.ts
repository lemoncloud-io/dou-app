// The `push` facade group — device-token registration.
//
// The mutation lives under `data/hooks/` because it is a REST call; its one consumer is apps/web's push
// debug screen, which registers by hand. The runtime's own registration is runtime-core's
// `PushRegistration`, started by the hook below, and calls the gateway without React.
export { useDeviceTokenRegistration } from './hooks/useDeviceTokenRegistration';
export type { DeviceTokenDelegate } from './hooks/useDeviceTokenRegistration';
export { useRegisterDeviceTokenMutation } from '../data/hooks/device';
