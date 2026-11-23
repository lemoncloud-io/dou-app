import type { RuntimeConfig, RuntimePorts } from '@chatic/runtime-core';

type AuthPorts = RuntimePorts['auth'];
type KeyValueStore = RuntimeConfig['storage']['plain'];

export interface NativeAuthOptions {
    plain: KeyValueStore;
    leaveToHome: AuthPorts['leaveToHome'];
}

export const HOME_SEARCH_KEY = 'chatic-runtime-mobile-home-search';

export const nativeAuthPorts = ({ plain, leaveToHome }: NativeAuthOptions): AuthPorts => {
    const saved = plain.get(HOME_SEARCH_KEY);
    if (saved !== null) plain.remove(HOME_SEARCH_KEY);
    const search = saved ? `?${saved}` : '';

    return {
        currentSearch: () => search,
        leaveToHome: params => {
            plain.set(HOME_SEARCH_KEY, params.toString());
            leaveToHome(params);
        },
    };
};
