const bodyText = (data: unknown): string => {
    if (typeof data === 'string') return data;
    const message = (data as { message?: unknown } | null | undefined)?.message;
    if (typeof message === 'string') return message;
    return data === undefined || data === null ? '' : JSON.stringify(data);
};

export const describeRequestError = (error: unknown, service: string): string => {
    const response = (error as { response?: { status?: number; data?: unknown } } | null | undefined)?.response;
    if (response) {
        return bodyText(response.data) || `HTTP ${response.status ?? '?'}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `No response from ${service} (${message}). A rejected request signature looks like this too.`;
};

export const asRequestError = (error: unknown, service: string): Error =>
    Object.assign(new Error(describeRequestError(error, service)), { cause: error });
