import installations from '@react-native-firebase/installations';
import type { IFirebaseInstallationService } from './types';
import type { ILogService } from '../../log';

export class FirebaseInstallationService implements IFirebaseInstallationService {
    constructor(private readonly logger: ILogService) {}

    async getFirebaseId(): Promise<string | null> {
        try {
            const id = await installations().getId();
            this.logger.warn(`FIREBASE`, 'Firebase Installation ID:', id);
            return id;
        } catch (error) {
            this.logger.error(`FIREBASE`, 'Failed to get Firebase Installation ID:', error);
            return null;
        }
    }
}
