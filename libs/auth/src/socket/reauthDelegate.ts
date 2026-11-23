import { sessionAuthAdapter } from '../session/sessionAuthAdapter';

import type { ReauthDelegate } from './types';

export const createReauthDelegate = (): ReauthDelegate => ({
    getAuthRegistration: slot => sessionAuthAdapter.getAuthRegistration(slot),
    signAuth: (slot, _token, target) => sessionAuthAdapter.signAuth(slot, target),
});
