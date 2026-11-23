import { useEffect, useState } from 'react';

import { startOfDay } from '../utils';

export const useStartOfToday = (): number => {
    const [today, setToday] = useState(() => startOfDay(Date.now()));

    useEffect(() => {
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        const timer = setTimeout(() => setToday(startOfDay(Date.now())), midnight.getTime() - Date.now() + 1000);
        return () => clearTimeout(timer);
    }, [today]);

    return today;
};
