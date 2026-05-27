/**
 * Timeout race wrapper to protect execution from running too long
 * @param promise - The promise to wrap
 * @param ms - Timeout duration in milliseconds
 * @param timeoutErrorMsg - Error message to throw on timeout
 */
export const withTimeout = <T>(promise: Promise<T>, ms: number, timeoutErrorMsg: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutErrorMsg)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};
