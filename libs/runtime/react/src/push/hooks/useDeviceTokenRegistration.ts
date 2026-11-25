import { useEffect, useRef, useState } from 'react';

import type { DeviceTokenDelegate } from '@chatic/runtime-client';

import { runtimeEngine } from '@chatic/runtime-client';

import { useDynamicDeviceId } from '../../session';

export type { DeviceTokenDelegate } from '@chatic/runtime-client';

export const useDeviceTokenRegistration = (delegate: DeviceTokenDelegate | null): void => {
    const ids = useDynamicDeviceId();

    const delegateRef = useRef(delegate);
    delegateRef.current = delegate;
    const idsRef = useRef(ids);
    idsRef.current = ids;

    const [registration] = useState(() =>
        runtimeEngine().pushRegistration({ delegate: () => delegateRef.current, deviceIds: () => idsRef.current })
    );

    const hasDelegate = !!delegate;
    useEffect(() => (hasDelegate ? registration.start() : undefined), [registration, hasDelegate]);

    useEffect(() => {
        if (!hasDelegate) return;
        const onFocus = () => registration.notifyForeground();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [registration, hasDelegate]);
};
