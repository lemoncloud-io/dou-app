// Minimal types for @liamcottle/push-receiver (ships no .d.ts).
// Only the surface we use: Android FCM registration + the MTLS receive client.
declare module '@liamcottle/push-receiver' {
    export const AndroidFCM: {
        /** Registers as an Android device and returns the FCM token + GCM checkin identity. */
        register(
            apiKey: string,
            projectId: string,
            gcmSenderId: string,
            gmsAppId: string,
            androidPackageName: string,
            androidPackageCert: string,
        ): Promise<{ gcm: { androidId: string; securityToken: string }; fcm: { token: string } }>;
    };

    export interface PushReceiverMessage {
        persistentId?: string;
        from?: string;
        category?: string;
        /** FCM data payload as an array of key/value pairs. */
        appData?: Array<{ key: string; value: string }>;
    }

    export class Client {
        constructor(androidId: string, securityToken: string, persistentIds: string[]);
        on(event: 'ON_DATA_RECEIVED', cb: (message: PushReceiverMessage) => void): void;
        on(event: 'connect' | 'disconnect', cb: () => void): void;
        connect(): void;
        destroy(): void;
    }
}
