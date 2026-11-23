import { redactMaybeJson, truncate } from '../redaction/redact';

interface AxiosLikeError {
    isAxiosError?: boolean;
    code?: unknown;
    config?: { method?: unknown; url?: unknown; baseURL?: unknown; params?: unknown; data?: unknown };
    response?: { status?: unknown; statusText?: unknown; data?: unknown };
}

const isAxiosLikeError = (error: Error): error is Error & AxiosLikeError => {
    const candidate = error as Error & AxiosLikeError;
    return candidate.isAxiosError === true || 'config' in candidate || 'response' in candidate;
};

const extractAxiosDetail = (error: Error & AxiosLikeError) => {
    const { code, config, response } = error;

    const request = config
        ? {
              method: config.method,
              url: config.url,
              baseURL: config.baseURL,
              params: truncate(redactMaybeJson(config.params)),
              data: truncate(redactMaybeJson(config.data)),
          }
        : undefined;

    const responseDetail = response
        ? {
              status: response.status,
              statusText: response.statusText,
              data: truncate(redactMaybeJson(response.data)),
          }
        : undefined;

    return {
        code: typeof code === 'string' ? code : undefined,
        request,
        response: responseDetail,
    };
};

export const safeSerializable = (value: unknown): unknown => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (value instanceof Error) {
        const base = {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };

        if (isAxiosLikeError(value)) {
            return { ...base, ...extractAxiosDetail(value) };
        }

        return base;
    }

    try {
        JSON.stringify(value);
        return value;
    } catch {
        return String(value);
    }
};
