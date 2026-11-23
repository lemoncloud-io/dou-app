import type { Adapter, PortName } from '@chatic/runtime-client';
import type { RuntimePorts } from '@chatic/runtime-core';
import type { CacheBridgeClient } from '@chatic/db';

import { nativeAuthPorts } from '../auth';
import { loadNativeSession } from '../boot';
import type { NativeSessionLoad } from '../boot';
import { nativeForegroundPorts } from '../foreground';
import type { AppStateSource } from '../foreground';
import { readNativeHostFacts } from '../hostFacts';
import type { NativeHostFacts, NativeHostFactsOptions } from '../hostFacts';
import { nativeLocalCachePorts } from '../localCache';
import { assertSecureRandom } from '../randomValues';
import { nativeStoragePorts } from '../storage';
import type { NativeStorageOptions } from '../storage';
import { nativeTransportPorts } from '../transport';

export type MobileAdapter<P extends PortName> = Adapter<P, RuntimePorts[P], NativeHostFacts>;

export const mobileHostFacts =
    (options: NativeHostFactsOptions): (() => NativeHostFacts) =>
    () => {
        assertSecureRandom();
        return readNativeHostFacts(options);
    };

export const transportMobile: MobileAdapter<'transport'> = {
    id: 'transport.mobile',
    port: 'transport',
    create: ({ facts }) => nativeTransportPorts({ userAgent: facts.userAgent }),
};

export const foregroundAppState: MobileAdapter<'foreground'> = {
    id: 'foreground.app-state',
    port: 'foreground',
    create: () => nativeForegroundPorts(),
};

export interface MobileAuthOptions {
    leaveToHome: RuntimePorts['auth']['leaveToHome'];
}

export const authMobile = ({ leaveToHome }: MobileAuthOptions): MobileAdapter<'auth'> => ({
    id: 'auth.mobile',
    port: 'auth',
    create: ({ storage }) => nativeAuthPorts({ plain: storage.plain, leaveToHome }),
});

export interface MobileVaultStorageOptions extends NativeStorageOptions {
    appState?: AppStateSource;
    onLoad?: (load: NativeSessionLoad) => void;
}

export const storageMobileVault = ({
    appState,
    onLoad,
    ...options
}: MobileVaultStorageOptions): MobileAdapter<'storage'> => ({
    id: 'storage.mobile-vault',
    port: 'storage',
    create: async () => {
        const storage = nativeStoragePorts(options);
        const load = await loadNativeSession(storage, options.vault, appState);
        onLoad?.(load);
        return storage;
    },
});

export const cacheMobileSqlite = (client: CacheBridgeClient): MobileAdapter<'cache'> => ({
    id: 'cache.mobile-sqlite',
    port: 'cache',
    create: () => nativeLocalCachePorts(client),
});
