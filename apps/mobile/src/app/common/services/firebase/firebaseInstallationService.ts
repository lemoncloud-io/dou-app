import installations from '@react-native-firebase/installations';
import { logger } from '../log';

export const firebaseInstallationService = {
    getFirebaseId: async (): Promise<string | null> => {
        try {
            const id = await installations().getId();
            logger.info(`FIREBASE`, 'Firebase Installation ID:', id);
            return id;
        } catch (error) {
            logger.error(`FIREBASE`, 'Failed to get Firebase Installation ID:', error);
            return null;
        }
    },
};
