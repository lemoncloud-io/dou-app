/**
 * A refusal raised by a `verifyEmail` implementation whose message is written FOR the user — an
 * address already bound to a cloud, say.
 *
 * It exists so the code-entry UI can tell that apart from a failed request. Everything else that
 * rejects carries backend wording (`throwIfApiError` re-throws `"403 FORBIDDEN - …"`, axios throws
 * `"Request failed with status code 500"`), which must never land in a toast.
 */
export class EmailVerifyRefusal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EmailVerifyRefusal';
    }
}

/** Matches on `name` rather than `instanceof` so it survives across bundle chunks. */
export const isEmailVerifyRefusal = (e: unknown): e is EmailVerifyRefusal =>
    e instanceof Error && e.name === 'EmailVerifyRefusal';
