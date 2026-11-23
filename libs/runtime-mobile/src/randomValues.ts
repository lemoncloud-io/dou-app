export type RandomSource = { crypto?: { getRandomValues?: unknown } };

export const assertSecureRandom = (scope: RandomSource = globalThis as RandomSource): void => {
    if (typeof scope.crypto?.getRandomValues === 'function') return;
    throw new Error(
        '[runtime-mobile] crypto.getRandomValues is missing — the app entry has to ' +
            "`import '@chatic/runtime-mobile/polyfills'` before anything else, then start the runtime."
    );
};
