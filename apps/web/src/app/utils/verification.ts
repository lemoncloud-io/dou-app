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

/** Formats remaining seconds as `mm:ss` for the code-entry countdown. */
export const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};
