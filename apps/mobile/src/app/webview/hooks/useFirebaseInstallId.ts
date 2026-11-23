import { useEffect, useState } from 'react';
import { firebaseInstallationService, logger } from '../../services';

export const useFirebaseInstallId = (): string | null => {
    const [installId, setInstallId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        firebaseInstallationService
            .getFirebaseId()
            .then(id => {
                if (active && id) {
                    setInstallId(id);
                }
            })
            .catch(error => {
                logger.error('FIREBASE', 'useFirebaseInstallId failed to resolve id', error);
            });

        return () => {
            active = false;
        };
    }, []);

    return installId;
};
