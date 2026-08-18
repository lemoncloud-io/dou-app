/**
 * One-time-code verification primitives, shared by every place a code is entered — the email dialog
 * (subscription), the phone sheet (auth), and the account pages. They lived under `features/account`
 * while it was the only consumer; three features now use them, so they belong here
 * (directory-structure.md §4-3).
 */

/** Digits in a verification code. The code inputs render exactly this many boxes. */
export const VERIFICATION_CODE_LENGTH = 6;

/** How long a sent code stays valid, in seconds. Drives the countdown next to the resend button. */
export const VERIFICATION_TIMER_SECONDS = 3 * 60;

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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

/** Formats remaining seconds as `mm:ss` for the code-entry countdown. */
export const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};
