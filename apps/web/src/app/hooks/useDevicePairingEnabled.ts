import { runtime } from '@chatic/runtime';

/** The device pairing entries stay hidden unless this flag is on — off in prod until the design is settled. */
export const useDevicePairingEnabled = (): boolean =>
    runtime.settings.useConfigValue<boolean>('feature.auth.devicePairing') === true;
