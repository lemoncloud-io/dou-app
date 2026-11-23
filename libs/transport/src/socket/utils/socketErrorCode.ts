export const getSocketErrorCode = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;

    const message = error instanceof Error ? error.message : String(error ?? '');
    const leadingStatus = /^\s*([1-5]\d{2})\b/.exec(message);
    return leadingStatus ? Number(leadingStatus[1]) : undefined;
};
