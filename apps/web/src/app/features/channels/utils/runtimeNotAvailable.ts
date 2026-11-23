export const isRuntimeNotAvailable = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'RUNTIME_NOT_AVAILABLE';
