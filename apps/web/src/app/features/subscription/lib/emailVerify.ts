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

/**
 * Whether a failed `send`/`resend` of `verify-email` is the relay's "this address belongs to someone
 * else" answer. Only meaningful for those two steps — callers check the step first.
 *
 * Email accounts are global on the relay: once another user has confirmed an address, `send` and
 * `resend` for it fail with `409 CONFLICT - alias[<email>] is already registered`, before any code
 * goes out. It is the only conflict those steps raise, so `409 CONFLICT` is the signal and the wording
 * after it is not matched. The relay reports it in the 200 body's `error`, which `throwIfApiError`
 * rethrows as a plain `Error` with no status, so the code sits at the start of the message. Anchored
 * there because the rest of the message echoes the address, and an address like `a.409@x.io` must not
 * read as a conflict; anything that prepends text falls back to the generic failure, which is safe.
 */
export const isEmailAlreadyRegistered = (e: unknown): boolean => {
    const message = (e as { message?: unknown } | null)?.message;
    return typeof message === 'string' && /^409 CONFLICT\b/.test(message.trim());
};
