import { useMemo } from 'react';

import { v4 as uuidv4 } from 'uuid';

const SESSION_ID_KEY = 'chatic_admin_session_id';

export const useSessionId = (): string => {
    return useMemo(() => {
        const stored = sessionStorage.getItem(SESSION_ID_KEY);
        if (stored) return stored;

        const newId = uuidv4();
        sessionStorage.setItem(SESSION_ID_KEY, newId);
        return newId;
    }, []);
};
