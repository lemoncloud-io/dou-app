import { runtime } from '@chatic/runtime';

export const useDevicePairingEnabled = (): boolean =>
    runtime.settings.useConfigValue<boolean>('feature.auth.devicePairing') === true;
