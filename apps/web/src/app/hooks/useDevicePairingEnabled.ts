import { runtime } from '@chatic/runtime-react';

export const useDevicePairingEnabled = (): boolean =>
    runtime.settings.useConfigValue<boolean>('feature.auth.devicePairing') === true;
