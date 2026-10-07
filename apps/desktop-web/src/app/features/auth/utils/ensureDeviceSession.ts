import { runtime } from '@chatic/app-runtime';

/**
 * Registers this device with the relay unless a session already exists. The backend's sign-in contract
 * expects a device session first, so anything that starts a social login has to have one first;
 * the Welcome page's guest start is the same registration. `register` is the guest-by-device mutation,
 * passed in because it is a hook and this is not.
 */
export const ensureDeviceSession = async (register: () => Promise<unknown>): Promise<void> => {
    if (runtime.session.getIdentityContext().isAuthenticated) return;
    await runtime.boot.startWebTransportInit();
    await register();
};
