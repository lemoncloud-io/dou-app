import { useEffect, useRef, useState } from 'react';

import { PushRegistration } from '@chatic/runtime-core';
import type { DeviceTokenDelegate } from '@chatic/runtime-core';

import { useDynamicDeviceId } from '../../session';

export type { DeviceTokenDelegate } from '@chatic/runtime-core';

/**
 * Cross-cloud push registration for native shells — runtime-core's `PushRegistration`, started for as
 * long as the calling component is mounted with a delegate. The once-per-install policy, the triggers
 * and the failure handling are documented there; this hook only starts and stops it.
 *
 * Pass `delegate: null` outside a native shell to make the hook a no-op — the "are we inside the
 * app?" check is shell knowledge and stays with the caller. The delegate may be a new object on every
 * render: the registration reads the latest one at each attempt.
 *
 * A page also hears the window regain focus without a visibility change (a desktop window that stayed
 * visible behind another app); the foreground port carries visibility only, so this hook hands that
 * edge over itself.
 */
export const useDeviceTokenRegistration = (delegate: DeviceTokenDelegate | null): void => {
    const ids = useDynamicDeviceId();

    // Latest-value refs: the registration reads them at each attempt, so a delegate rebuilt every
    // render does not restart it.
    const delegateRef = useRef(delegate);
    delegateRef.current = delegate;
    const idsRef = useRef(ids);
    idsRef.current = ids;

    const [registration] = useState(
        () => new PushRegistration({ delegate: () => delegateRef.current, deviceIds: () => idsRef.current })
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
