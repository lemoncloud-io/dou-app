import { runtime } from '@chatic/runtime';

/**
 * Copy a value and report whether it landed.
 *
 * Both of the host's ways (`runtime.links.copyText`) can actually answer, so a caller showing feedback
 * does not have to guess: the app replies to `CopyToClipboard` or fails it, and
 * `navigator.clipboard.writeText` returns a promise. An absent `navigator.clipboard` — a
 * non-secure context, an old WebView — is a failure rather than a silent no-op, which is the whole
 * reason this exists: the old fire-and-forget version reported success it never had.
 */
export const copyTextWithResult = async (value: string | null | undefined): Promise<boolean> => {
    if (!value) return false;

    try {
        return await runtime.links.copyText(value);
    } catch {
        return false;
    }
};

/**
 * Copy without waiting for the outcome. For the call sites that show no feedback; anything with a
 * "copied" indicator must use `copyTextWithResult` (see `CopyButton`) so the indicator cannot lie.
 */
export const copyText = (value: string | null | undefined): void => {
    void copyTextWithResult(value);
};
