/**
 * JSON.stringify 실패 방어를 위한 safe serialization.
 *
 * - undefined / null -> undefined
 * - Error -> { name, message, stack }
 * - JSON 직렬화 가능 값 -> 원본 값
 * - circular reference 등 직렬화 불가 값 -> String(value)
 */
export const safeSerializable = (value: unknown): unknown => {
    if (value === undefined || value === null) {
        return undefined;
    }

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
