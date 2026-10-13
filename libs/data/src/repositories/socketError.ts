/**
 * Did a socket request fail with 404? The `:error` frame carries `errorCode`, which the socket library
 * drops when it rejects; `@chatic/app-runtime`'s socket manager puts it back on the Error. Read that
 * property when present, otherwise the message prefix (`404 NOT FOUND - …`).
 *
 * The same leading-status reading as `getSocketErrorCode` in `@chatic/app-runtime` (and its copy in
 * apps/web), repeated here because this lib cannot depend on the runtime. A change to one belongs in
 * the others.
 */
export const isNotFoundError = (error: unknown): boolean => {
    if ((error as { errorCode?: unknown } | null)?.errorCode === 404) return true;
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /^\s*404\b/.test(message);
};
