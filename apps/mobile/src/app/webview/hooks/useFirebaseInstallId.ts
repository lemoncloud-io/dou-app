import { useEffect, useState } from 'react';
import { firebaseInstallationService, logger } from '../../services';

/**
 * Fetches the Firebase installation id once on mount and exposes it to the render.
 *
 * The id is read asynchronously (`installations().getId()`), so it starts as `null` and updates
 * once resolved. Callers combine it with the device id for the injected `uniqueId`
 * (see `buildInjectedUniqueId`); until it resolves they simply get the bare device id.
 */
export const useFirebaseInstallId = (): string | null => {
    const [installId, setInstallId] = useState<string | null>(null);

    useEffect(() => {
        // Guard against a state update after unmount if the async lookup is slow.
        let active = true;

        firebaseInstallationService
            .getFirebaseId()
            .then(id => {
                if (active && id) {
                    setInstallId(id);
                }
            })
            .catch(error => {
                // getFirebaseId already swallows errors and returns null, but keep a defensive
                // catch so a rejected promise never surfaces as an unhandled rejection.
                logger.error('FIREBASE', 'useFirebaseInstallId failed to resolve id', error);
            });

        return () => {
            active = false;
        };
    }, []);

    return installId;
};
