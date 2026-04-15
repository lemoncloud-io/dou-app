import { useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { ListResult } from '@lemoncloud/chatic-backend-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

// 싱글톤 상태
let globalPlaces: MySiteView[] = [];
let globalIsLoading = true;
let globalIsError = false;
const listeners: Set<() => void> = new Set();
let isBootstrapped = false;

const notifyListeners = () => listeners.forEach(l => l());

const setGlobalState = (places: MySiteView[], isLoading: boolean, isError: boolean) => {
    globalPlaces = places;
    globalIsLoading = isLoading;
    globalIsError = isError;
    notifyListeners();
};

const bootstrap = (emitAuthenticated: (msg: object) => void) => {
    if (isBootstrapped) return;
    isBootstrapped = true;

    setGlobalState(globalPlaces, true, false);
    emitAuthenticated({ type: 'user', action: 'my-site' });

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (globalIsLoading) setGlobalState([], false, true);
    }, 10000);

    useWebSocketV2Store.subscribe(
        s => s.lastMessage,
        lastMessage => {
            const envelope = lastMessage as WSSEnvelope<ListResult<MySiteView>> | null;
            if (!envelope) return;
            if (envelope.type !== 'user' || envelope.action !== 'my-site') return;

            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            if (envelope.action === 'error') {
                setGlobalState([], false, true);
                return;
            }

            setGlobalState(envelope.payload?.list ?? [], false, false);
        }
    );
};

let globalEmitAuthenticated: ((msg: object) => void) | null = null;

useWebSocketV2Store.subscribe(
    s => s.isVerified,
    isVerified => {
        if (!isVerified || !globalEmitAuthenticated) return;
        isBootstrapped = false;
        bootstrap(globalEmitAuthenticated);
    }
);

useWebSocketV2Store.subscribe(
    s => s.isConnected,
    isConnected => {
        if (!isConnected) isBootstrapped = false;
    }
);

const setPlaces = (updater: (prev: MySiteView[]) => MySiteView[]) => {
    setGlobalState(updater(globalPlaces), globalIsLoading, globalIsError);
};

const retryMyPlaces = () => {
    if (!globalEmitAuthenticated) return;
    setGlobalState([], true, false);
    globalEmitAuthenticated({ type: 'user', action: 'my-site' });
};

export const useMyPlaces = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const [, forceUpdate] = useState({});

    globalEmitAuthenticated = emitAuthenticated;

    useEffect(() => {
        const listener = () => forceUpdate({});
        listeners.add(listener);
        if (isVerified && globalEmitAuthenticated && !isBootstrapped) {
            bootstrap(globalEmitAuthenticated);
        }
        return () => {
            listeners.delete(listener);
        };
    }, [isVerified]);

    return {
        places: globalPlaces,
        isLoading: globalIsLoading,
        isError: globalIsError,
        setPlaces,
        retry: retryMyPlaces,
    };
};
