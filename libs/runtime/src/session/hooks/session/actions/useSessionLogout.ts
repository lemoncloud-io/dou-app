import { useCallback } from 'react';

import type { LogoutOptions } from '@chatic/runtime-client';

import { logoutSession } from '@chatic/runtime-client';

export const useSessionLogout = () => useCallback((options?: LogoutOptions) => logoutSession(options), []);
