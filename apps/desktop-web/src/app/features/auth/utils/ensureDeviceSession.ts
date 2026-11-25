import { runtime } from '@chatic/runtime-react';

export const ensureDeviceSession = async (register: () => Promise<unknown>): Promise<void> => {
    if (runtime.session.getIdentityContext().isAuthenticated) return;
    await register();
};
