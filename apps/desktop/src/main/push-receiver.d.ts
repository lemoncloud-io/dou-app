declare module '@liamcottle/push-receiver' {
    export const AndroidFCM: {
        register(
            apiKey: string,
            projectId: string,
            gcmSenderId: string,
            gmsAppId: string,
            androidPackageName: string,
            androidPackageCert: string
        ): Promise<{ gcm: { androidId: string; securityToken: string }; fcm: { token: string } }>;
        installRequest(
            apiKey: string,
            projectId: string,
            gmsAppId: string,
            androidPackageName: string,
            androidPackageCert: string
        ): Promise<string>;
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
