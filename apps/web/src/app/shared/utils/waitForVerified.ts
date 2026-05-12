import { useWebSocketV2Store } from '@chatic/socket';

/**
 * isVerified가 true로 전환될 때까지 대기하는 Promise
 * auth:update 응답을 기다리는 데 사용
 */
export const waitForVerified = (timeoutMs = 5000): Promise<boolean> => {
    return new Promise(resolve => {
        if (useWebSocketV2Store.getState().isVerified) {
            resolve(true);
            return;
        }

        const timer = setTimeout(() => {
            unsub();
            resolve(false);
        }, timeoutMs);

        const unsub = useWebSocketV2Store.subscribe(
            s => s.isVerified,
            verified => {
                if (verified) {
                    clearTimeout(timer);
                    unsub();
                    resolve(true);
                }
            }
        );
    });
};
