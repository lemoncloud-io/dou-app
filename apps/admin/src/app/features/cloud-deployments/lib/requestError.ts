/**
 * `lib/cloud-deployments/requestError.ts`
 * - What a failed signed call says on screen, for the goods service and the relay alike.
 */

const bodyText = (data: unknown): string => {
    if (typeof data === 'string') return data;
    const message = (data as { message?: unknown } | null | undefined)?.message;
    if (typeof message === 'string') return message;
    return data === undefined || data === null ? '' : JSON.stringify(data);
};

/**
 * The response body is shown as it came — the server puts the reason there (a `busy` product refused
 * without `force`, an unknown id). A failure with no response at all is worth naming, with the
 * service it came from: a request signature the gateway rejects comes back without CORS headers, so
 * the browser reports a bare network error where a 403 actually happened.
 */
export const describeRequestError = (error: unknown, service: string): string => {
    const response = (error as { response?: { status?: number; data?: unknown } } | null | undefined)?.response;
    if (response) {
        return bodyText(response.data) || `HTTP ${response.status ?? '?'}`;
    }
    const message = error instanceof Error ? error.message : String(error);
    return `No response from ${service} (${message}). A rejected request signature looks like this too.`;
};

/** The readable failure, with the original kept as `cause` for whoever logs it. */
export const asRequestError = (error: unknown, service: string): Error =>
    Object.assign(new Error(describeRequestError(error, service)), { cause: error });
