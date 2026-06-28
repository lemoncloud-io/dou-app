// Local error helpers. These were previously imported from `@chatic/web-core`,
// but that package no longer re-exports them from its public barrel. They are
// trivial, dependency-free utilities, so we keep an app-local copy.

/** Coerce an unknown thrown value into a real Error instance. */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Reject if `promise` does not settle within `ms` milliseconds. */
export const withTimeout = <T>(promise: Promise<T>, ms: number, context = 'Operation'): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`TIMEOUT: ${context} timed out (${ms}ms)`)), ms);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};
