import { redactMaybeJson, truncate } from '@chatic/logger';

/**
 * Shape of the axios-specific fields we lift off an error. Axios is not a
 * dependency of this package, so we duck-type instead of importing its types.
 */
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

/**
 * Extracts the network detail carried by an axios error into a plain,
 * JSON-serializable object. Request bodies/params are masked and truncated;
 * headers are intentionally omitted because they carry auth tokens and AWS
 * signatures. Returns `undefined` for fields that are absent (e.g. no
 * `response` on a network-level failure) so they are simply left off the entry.
 */
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

/**
 * JSON.stringify 실패 방어를 위한 safe serialization.
 *
 * - undefined / null -> undefined
 * - Axios Error -> { name, message, stack, code, request, response } (민감정보 마스킹)
 * - Error -> { name, message, stack }
 * - JSON 직렬화 가능 값 -> 원본 값
 * - circular reference 등 직렬화 불가 값 -> String(value)
 */
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

        // Axios errors are `instanceof Error`, so without this branch the
        // response/config/code that hold the actual network detail would be
        // dropped, leaving only name/message/stack.
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
