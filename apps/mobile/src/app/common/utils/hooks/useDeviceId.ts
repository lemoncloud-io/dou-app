import { useEffect, useState } from 'react';

import { getDeviceId } from '../device';

export const useDeviceId = () => {
    const [deviceId, setDeviceId] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        getDeviceId().then(id => {
            if (isMounted) {
                setDeviceId(id);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    return deviceId;
};
