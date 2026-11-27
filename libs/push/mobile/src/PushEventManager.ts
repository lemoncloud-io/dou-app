import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import type { IPushEventManager } from './types';
import type { Logger } from '@chatic/logger';

export class PushEventManager implements IPushEventManager {
    private readonly receiveListeners = new Set<(message: FirebaseMessagingTypes.RemoteMessage) => void>();

    constructor(private readonly logger: Logger) {}

    onReceiveNotification(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.receiveListeners.add(callback);
        this.logger.debug('PUSH_EVENT', 'Registered OnReceiveNotification listener.');
        return () => {
            this.receiveListeners.delete(callback);
            this.logger.debug('PUSH_EVENT', 'Unregistered OnReceiveNotification listener.');
        };
    }

    emitReceiveNotification(message: FirebaseMessagingTypes.RemoteMessage): void {
        this.logger.info('PUSH_EVENT', `Emitting OnReceiveNotification to ${this.receiveListeners.size} listeners`);
        this.receiveListeners.forEach(listener => {
            try {
                listener(message);
            } catch (err) {
                this.logger.error('PUSH_EVENT', 'Error in OnReceiveNotification listener callback', err as Error);
            }
        });
    }
}
