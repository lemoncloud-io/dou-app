import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import type { IPushEventManager } from './types';
import type { ILogService } from '../log';

/**
 * PushEventManager
 *
 * A singleton event listener registry that flexibly decouples the lowest-level native notification
 * channel from the hybrid WebView bridge (`useFcmHandler`).
 * Prevents dropped pushes caused by the race condition between the WebView lifecycle and mobile
 * startup timing, and manages propagation to multiple observer callbacks.
 */
export class PushEventManager implements IPushEventManager {
    /**
     * The set of all observer callbacks registered to be notified of foreground receive events
     */
    private readonly receiveListeners = new Set<(message: FirebaseMessagingTypes.RemoteMessage) => void>();

    constructor(private readonly logger: ILogService) {}

    /**
     * Adds a listener to be notified of real-time push messages received in the foreground.
     * @param callback the observer callback handler that processes the notification message
     * @returns an unsubscribe function to safely remove the registered callback listener again
     */
    onReceiveNotification(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.receiveListeners.add(callback);
        this.logger.debug('PUSH_EVENT', 'Registered OnReceiveNotification listener.');
        return () => {
            this.receiveListeners.delete(callback);
            this.logger.debug('PUSH_EVENT', 'Unregistered OnReceiveNotification listener.');
        };
    }

    /**
     * Multicasts (emits) a detected foreground push message to every registered WebView bridge listener.
     * Even if one listener throws, propagation to the other subscribers is still guaranteed.
     * @param message the original Firebase RemoteMessage object to propagate
     */
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
