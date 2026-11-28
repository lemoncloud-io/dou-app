import { type FcmConfig, type FcmPush, type PushHost, startFcm } from './fcm';

let fcmToken: string | null = null;
let fcmTokenWaiters: Array<(token: string) => void> = [];
const onFcmToken = (token: string): void => {
    fcmToken = token;
    fcmTokenWaiters.forEach(resolve => resolve(token));
    fcmTokenWaiters = [];
};
export const awaitFcmToken = (): Promise<string> => {
    if (fcmToken) return Promise.resolve(fcmToken);
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            fcmTokenWaiters = fcmTokenWaiters.filter(waiter => waiter !== entry);
            resolve(fcmToken ?? '');
        }, 30_000);
        const entry = (token: string): void => {
            clearTimeout(timer);
            resolve(token);
        };
        fcmTokenWaiters.push(entry);
    });
};

export const startPush = (
    config: FcmConfig,
    handlers: { onToken: (token: string) => void; onPush: (push: FcmPush) => void },
    host: PushHost
): void => {
    void startFcm(
        config,
        {
            onToken: token => {
                onFcmToken(token);
                handlers.onToken(token);
            },
            onPush: push => handlers.onPush(push),
        },
        host
    ).catch(error => console.error('[fcm] start failed', error));
};
