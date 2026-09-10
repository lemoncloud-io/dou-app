import { isNative } from '@chatic/bridges';

// Direct path, not the `bridge` barrel: the barrel re-exports ./navigation, which pulls
// usePushNavigate → @chatic/web-core → webTransport's `import.meta.env`. ts-jest emits CommonJS,
// where that is a syntax error, so anything importing this module became untestable.
import { appBridge } from '../../../bridge/appBridge';

/**
 * Copy a value and report whether it landed.
 *
 * Both paths can actually answer, so a caller showing feedback does not have to guess:
 * `CopyToClipboard` is a `webClient.request` (the app replies, or rejects on an older build), and
 * `navigator.clipboard.writeText` returns a promise. An absent `navigator.clipboard` — a
 * non-secure context, an old WebView — is a failure rather than a silent no-op, which is the whole
 * reason this exists: the old fire-and-forget version reported success it never had.
 */
export const copyTextWithResult = async (value: string | null | undefined): Promise<boolean> => {
    if (!value) return false;

    try {
        if (isNative()) {
            await appBridge.copyClipBoard(value);
            return true;
        }
        if (!navigator.clipboard) return false;
        await navigator.clipboard.writeText(value);
        return true;
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
