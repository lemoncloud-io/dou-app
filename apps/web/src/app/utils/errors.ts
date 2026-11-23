export const toError = (e: unknown): Error => {
    if (e instanceof Error) return e;
    if (typeof Event !== 'undefined' && e instanceof Event) return new Error(describeEvent(e));
    return new Error(String(e));
};

const describeEvent = (event: Event): string => {
    const target = event.target as { url?: unknown; readyState?: unknown; constructor?: { name?: string } } | null;
    if (typeof target?.url === 'string' && typeof target.readyState === 'number') {
        return `WebSocket ${event.type} event (url=${target.url}, readyState=${target.readyState})`;
    }
    return `${event.type} event on ${target?.constructor?.name ?? 'unknown target'}`;
};

export const getSocketErrorCode = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;

    const leadingStatus = /^\s*([1-5]\d{2})\b/.exec(toError(error).message);
    return leadingStatus ? Number(leadingStatus[1]) : undefined;
};

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
