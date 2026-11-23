import { runtime } from '@chatic/runtime';

export const ensureDeviceSession = async (register: () => Promise<unknown>): Promise<void> => {
    if (runtime.session.getIdentityContext().isAuthenticated) return;
    await register();
};
