import type { AppMessageError, RuntimeWireValue } from '@chatic/bridge-messages';

export const RUNTIME_ERROR_CODE = 'RUNTIME_ERROR';

export const RUNTIME_NOT_AVAILABLE_CODE = 'RUNTIME_NOT_AVAILABLE';

export interface RuntimeErrorDetails {
    name: string;
    message: string;
    code?: string | number;
    errorCode?: number;
    status?: number;
    statusCode?: number;
    response?: { status?: number; data?: RuntimeWireValue };
}

type ErrorFields = {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    errorCode?: unknown;
    status?: unknown;
    statusCode?: unknown;
    response?: unknown;
};

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

const asWireValue = (value: unknown): RuntimeWireValue | undefined => {
    if (value === undefined) return undefined;
    try {
        const text = JSON.stringify(value);
        return text === undefined ? undefined : (JSON.parse(text) as RuntimeWireValue);
    } catch {
        return undefined;
    }
};

const describe = (value: unknown): string => {
    try {
        return String(value);
    } catch {
        return 'Unknown error';
    }
};

const pickFields = (error: object): RuntimeErrorDetails => {
    const fields = error as ErrorFields;
    const details: RuntimeErrorDetails = {
        name: typeof fields.name === 'string' ? fields.name : 'Error',
        message: typeof fields.message === 'string' ? fields.message : describe(error),
    };
    if (typeof fields.code === 'string' || typeof fields.code === 'number') details.code = fields.code;
    const errorCode = asNumber(fields.errorCode);
    if (errorCode !== undefined) details.errorCode = errorCode;
    const status = asNumber(fields.status);
    if (status !== undefined) details.status = status;
    const statusCode = asNumber(fields.statusCode);
    if (statusCode !== undefined) details.statusCode = statusCode;
    if (typeof fields.response === 'object' && fields.response !== null) {
        const source = fields.response as { status?: unknown; data?: unknown };
        const response: NonNullable<RuntimeErrorDetails['response']> = {};
        const responseStatus = asNumber(source.status);
        if (responseStatus !== undefined) response.status = responseStatus;
        const data = asWireValue(source.data);
        if (data !== undefined) response.data = data;
        details.response = response;
    }
    return details;
};

export const serializeRuntimeError = (error: unknown): RuntimeErrorDetails => {
    if (typeof error !== 'object' || error === null) return { name: 'Error', message: describe(error) };
    try {
        return pickFields(error);
    } catch {
        return { name: 'Error', message: describe(error) };
    }
};

export const toRuntimeFailure = (error: unknown): AppMessageError => {
    const details = serializeRuntimeError(error);
    return { code: RUNTIME_ERROR_CODE, message: details.message, details };
};

export const runtimeNotAvailableFailure = (target: string, method: string): AppMessageError => ({
    code: RUNTIME_NOT_AVAILABLE_CODE,
    message: `${target}.${method} is not in this app's runtime`,
});

export const reviveRuntimeError = (failure: AppMessageError | null | undefined): Error => {
    const crossed = failure?.code === RUNTIME_ERROR_CODE ? failure.details : undefined;
    if (
        typeof crossed === 'object' &&
        crossed !== null &&
        typeof (crossed as { message?: unknown }).message === 'string'
    ) {
        const { name, message, ...fields } = serializeRuntimeError(crossed);
        const error = new Error(message);
        error.name = name;
        return Object.assign(error, fields);
    }
    const code = typeof failure?.code === 'string' ? failure.code : RUNTIME_ERROR_CODE;
    const text = typeof failure?.message === 'string' ? failure.message : 'The runtime call failed';
    const message = code === 'TIMEOUT' ? `408 REQUEST TIMEOUT - ${text}` : text;
    return Object.assign(new Error(message), { code });
};
