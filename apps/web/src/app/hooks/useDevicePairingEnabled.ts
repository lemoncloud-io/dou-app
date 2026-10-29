import { useConfigValue } from '@chatic/config/react';

/** The device pairing entries stay hidden unless this flag is on — off in prod until the design is settled. */
export const useDevicePairingEnabled = (): boolean => useConfigValue<boolean>('feature.auth.devicePairing') === true;
