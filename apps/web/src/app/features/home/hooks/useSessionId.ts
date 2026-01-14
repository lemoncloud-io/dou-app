import { useEffect, useState } from 'react';

import { v4 as uuidv4 } from 'uuid';

const SESSION_ID_KEY = 'chatic_session_id';

export const useSessionId = () => {
    const [sessionId, setSessionId] = useState<string>(() => {
        const stored = sessionStorage.getItem(SESSION_ID_KEY);
        if (stored) return stored;

        const newId = uuidv4();
        sessionStorage.setItem(SESSION_ID_KEY, newId);
        return newId;
    });

    useEffect(() => {
        sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }, [sessionId]);

    return sessionId;
};
