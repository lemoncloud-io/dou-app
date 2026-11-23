export const isNotFoundError = (error: unknown): boolean => {
    if ((error as { errorCode?: unknown } | null)?.errorCode === 404) return true;
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /^\s*404\b/.test(message);
};
