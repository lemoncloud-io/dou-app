/**
 * - 구조화된 에러 문자열 치환
 * @param error error 객체
 */
export const serializeError = (error: any) => {
    if (!error) return 'Unknown error.';

    if (error instanceof Error) {
        return {
            ...error,
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    if (typeof error === 'object') {
        return error;
    }

    return String(error);
};

export const serializeLogValue = (value: unknown): unknown => {
    if (value == null) return value;

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }

    try {
        JSON.stringify(value);
        return value;
    } catch {
        return String(value);
    }
};
