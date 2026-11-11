import type { AppMessageError, RuntimeWireValue } from '@chatic/bridge-messages';

/** The `code` a failed `RuntimeCall` answers with; its `details` are a {@link RuntimeErrorDetails}. */
export const RUNTIME_ERROR_CODE = 'RUNTIME_ERROR';

/**
 * The `code` a `RuntimeCall` answers with when the shell's runtime has no such target or method. A
 * method is added to the contract without raising its version, so a page newer than the installed app
 * can call one the app's runtime predates; this is how it learns that, apart from a call that ran and
 * failed. The page reads it as "not in this app yet" and falls back.
 */
export const RUNTIME_NOT_AVAILABLE_CODE = 'RUNTIME_NOT_AVAILABLE';

/**
 * An error thrown in the shell's runtime, as it crosses the bridge.
 *
 * Screens do not branch on error classes. They read fields off whatever was thrown: the message's
 * leading status (`408 REQUEST TIMEOUT - …`), the status a socket rejection carries as `errorCode`, the
 * HTTP status as `status`, `statusCode` or `response.status`, an axios `code` such as `ERR_NETWORK`,
 * and the server's body as `response.data`. So those fields are what crosses, unchanged, and the page
 * throws an `Error` that carries them again — the same checks give the same answers whichever process
 * ran the call. The stack does not cross: it describes the other process.
 *
 * Markers the owner's own recovery reads — the stale-credential route `@chatic/http` stamps on a failed
 * request — do not cross either: that recovery runs where the session is, before the error reaches the
 * page.
 */
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

/** `value` as plain JSON, or `undefined` when it is not representable (a cycle, a BigInt). */
const asWireValue = (value: unknown): RuntimeWireValue | undefined => {
    if (value === undefined) return undefined;
    try {
        const text = JSON.stringify(value);
        return text === undefined ? undefined : (JSON.parse(text) as RuntimeWireValue);
    } catch {
        return undefined;
    }
};

/** `String(value)`, or a fixed text for a value that refuses (an object with no prototype, a throwing `toString`). */
const describe = (value: unknown): string => {
    try {
        return String(value);
    } catch {
        return 'Unknown error';
    }
};

/** Reads the allowed fields off `error`. Each read may throw (a getter); the caller catches. */
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

/** What crosses the bridge for `error`. Never throws: anything thrown becomes at least a name and a message. */
export const serializeRuntimeError = (error: unknown): RuntimeErrorDetails => {
    if (typeof error !== 'object' || error === null) return { name: 'Error', message: describe(error) };
    try {
        return pickFields(error);
    } catch {
        return { name: 'Error', message: describe(error) };
    }
};

/** The failure a `RuntimeCall` answers with when its method threw `error`. */
export const toRuntimeFailure = (error: unknown): AppMessageError => {
    const details = serializeRuntimeError(error);
    return { code: RUNTIME_ERROR_CODE, message: details.message, details };
};

/** The failure a `RuntimeCall` answers with when the shell's runtime has no `target.method`. */
export const runtimeNotAvailableFailure = (target: string, method: string): AppMessageError => ({
    code: RUNTIME_NOT_AVAILABLE_CODE,
    message: `${target}.${method} is not in this app's runtime`,
});

/**
 * The error the page throws for a failed `RuntimeCall`: an `Error` with the fields that crossed.
 *
 * What crossed is read through the same allow-list it was written with, so the page's `Error` gets
 * only those fields — never a `stack`, a prototype or a mistyped status from the other side.
 *
 * A failure that is not a runtime error becomes an `Error` that carries its code. The bridge's own
 * `TIMEOUT` reads as the socket client's timeout does (`408 REQUEST TIMEOUT - …`), so a screen that
 * treats a 408 as "no answer" reads a call the bridge gave up on the same way as one the socket gave up
 * on.
 */
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
