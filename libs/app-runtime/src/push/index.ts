// The `push` facade group — device-token registration.
//
// The mutation lives under `data/hooks/` because it is a REST call the runtime owns, but its only
// consumers are this hook and the two apps' registration screens, so the facade sells both from one
// place instead of making a caller know that split.
export { useDeviceTokenRegistration } from './hooks/useDeviceTokenRegistration';
export type { DeviceTokenDelegate } from './hooks/useDeviceTokenRegistration';
export { useRegisterDeviceTokenMutation } from '../data/hooks/device';
