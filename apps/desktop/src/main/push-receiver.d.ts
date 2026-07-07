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
            androidPackageCert: string
        ): Promise<{ gcm: { androidId: string; securityToken: string }; fcm: { token: string } }>;
        /** Creates a Firebase installation; returns its short-lived auth token (feeds registerRequest). */
        installRequest(
            apiKey: string,
            projectId: string,
            gmsAppId: string,
            androidPackageName: string,
            androidPackageCert: string
        ): Promise<string>;
        /** Mints an FCM token for an existing GCM checkin identity; returns the token string. */
        registerRequest(
            androidId: string,
            securityToken: string,
            installationAuthToken: string,
            apiKey: string,
            gcmSenderId: string,
            gmsAppId: string,
            androidPackageName: string,
            androidPackageCert: string
        ): Promise<string>;
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
        connect(): Promise<void>;
        destroy(): void;
    }
}
