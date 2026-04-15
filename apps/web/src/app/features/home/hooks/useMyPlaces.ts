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

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const MAX_BOOTSTRAP_RETRIES = 2;
let bootstrapRetryCount = 0;
let bootstrapTimeoutId: ReturnType<typeof setTimeout> | null = null;

const notifyListeners = () => listeners.forEach(l => l());

const setGlobalState = (places: MySiteView[], isLoading: boolean, isError: boolean) => {
    globalPlaces = places;
    globalIsLoading = isLoading;
    globalIsError = isError;
    notifyListeners();
};

const clearBootstrapTimeout = () => {
    if (bootstrapTimeoutId) {
        clearTimeout(bootstrapTimeoutId);
        bootstrapTimeoutId = null;
    }
};

const emitMySiteRequest = () => {
    if (globalEmitAuthenticated) {
        globalEmitAuthenticated({ type: 'user', action: 'my-site' });
    }
};

const scheduleBootstrapTimeout = () => {
    clearBootstrapTimeout();
    bootstrapTimeoutId = setTimeout(() => {
        if (!globalIsLoading) return;
        if (bootstrapRetryCount < MAX_BOOTSTRAP_RETRIES) {
            bootstrapRetryCount++;
            console.log(`[useMyPlaces] Bootstrap timeout, retrying (${bootstrapRetryCount}/${MAX_BOOTSTRAP_RETRIES})`);
            emitMySiteRequest();
            scheduleBootstrapTimeout();
        } else {
            setGlobalState(globalPlaces.length > 0 ? globalPlaces : [], false, true);
        }
    }, BOOTSTRAP_TIMEOUT_MS);
};

const bootstrap = (emitAuthenticated: (msg: object) => void) => {
    if (isBootstrapped) return;
    isBootstrapped = true;
    bootstrapRetryCount = 0;

    setGlobalState(globalPlaces, true, false);
    emitMySiteRequest();
    scheduleBootstrapTimeout();
};

// Single message subscription (module-level, never duplicated)
useWebSocketV2Store.subscribe(
    s => s.lastMessage,
    lastMessage => {
        const envelope = lastMessage as WSSEnvelope<ListResult<MySiteView>> | null;
        if (!envelope) return;
        if (envelope.type !== 'user' || envelope.action !== 'my-site') return;

        clearBootstrapTimeout();

        if (envelope.action === 'error') {
            setGlobalState([], false, true);
            return;
        }

        setGlobalState(envelope.payload?.list ?? [], false, false);
    }
);

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
        if (!isConnected) {
            isBootstrapped = false;
            clearBootstrapTimeout();
        }
    }
);

// Foreground resync: re-bootstrap when app returns from background
if (typeof window !== 'undefined') {
    window.addEventListener('foreground-resync', () => {
        if (!globalEmitAuthenticated) return;
        isBootstrapped = false;
        bootstrap(globalEmitAuthenticated);
    });
}

const setPlaces = (updater: (prev: MySiteView[]) => MySiteView[]) => {
    setGlobalState(updater(globalPlaces), globalIsLoading, globalIsError);
};

const retryMyPlaces = () => {
    if (!globalEmitAuthenticated) return;
    setGlobalState([], true, false);
    emitMySiteRequest();
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
