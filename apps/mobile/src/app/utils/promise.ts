export const withTimeout = <T>(promise: Promise<T>, ms: number, timeoutErrorMsg: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutErrorMsg)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};
