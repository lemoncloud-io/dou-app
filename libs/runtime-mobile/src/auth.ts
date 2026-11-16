import type { RuntimeConfig, RuntimePorts } from '@chatic/runtime-core';

type AuthPorts = RuntimePorts['auth'];
type KeyValueStore = RuntimeConfig['storage']['plain'];

/**
 * Where the parameters of the last session's end wait for the next boot. In the plain store, outside
 * the session's own keys, so the sign-out that writes it does not also sweep it.
 */
export const HOME_SEARCH_KEY = 'chatic-runtime-mobile-home-search';

/**
 * The auth's ports for React Native: an address carried across a restart in the plain store, and the
 * app's own way home.
 *
 * A page ends a session in two lifetimes: the sign-out clears what it can and navigates to
 * `/?logout=1`, and the next document's boot reads that flag and sweeps once more — the log pipeline
 * can write a batch between the clear and the navigation. A native process has no address to carry the
 * flag, so these ports keep one:
 *
 * - `leaveToHome` saves the parameters, then hands over to the app's own `leaveToHome`. What "home" is
 *   after a session ends — a reloaded JS context, a reset navigation — is the app's decision, and so is
 *   dropping the in-memory state a page drops by reloading.
 * - `currentSearch` answers, for the whole of the next lifetime, what the previous one saved — read and
 *   removed once, when these ports are built at boot — the way a page's `location.search` holds
 *   `?logout=1` for the document it opened. With nothing saved it is empty: a native process is not
 *   opened with an address.
 *
 * If the app does not restart, the saved flag waits for the next launch; the sweep it triggers there
 * only removes keys a sign-out already removed, so arriving late costs nothing.
 */
export const nativeAuthPorts = (plain: KeyValueStore, leaveToHome: AuthPorts['leaveToHome']): AuthPorts => {
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
