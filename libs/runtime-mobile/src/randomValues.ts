/** The part of the global object the check reads. */
export type RandomSource = { crypto?: { getRandomValues?: unknown } };

/**
 * Throws unless `crypto.getRandomValues` is there.
 *
 * Without it `uuid` and `crypto-js` fail at their first draw, somewhere deep in a sign-in, with an
 * error that names neither the cause nor the fix. A runtime built without the polyfill fails here
 * instead, at boot, saying which import is missing. There is nothing to fall back to: a `Math.random`
 * substitute would make ids and nonces predictable, which is worse than not starting.
 *
 * It sees only that a function is there. It cannot tell whether that function draws from a secure
 * source, nor whether it was in place before a module took its random source at load — those rest on
 * the polyfill entry being the first import, which the README asks of the app's entry.
 */
export const assertSecureRandom = (scope: RandomSource = globalThis as RandomSource): void => {
    if (typeof scope.crypto?.getRandomValues === 'function') return;
    throw new Error(
        '[runtime-mobile] crypto.getRandomValues is missing — the app entry has to ' +
            "`import '@chatic/runtime-mobile/polyfills'` before anything else, then call createNativeRuntime()."
    );
};
